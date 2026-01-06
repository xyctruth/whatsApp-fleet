package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"whatsapp-aggregator/internal/config"
	"whatsapp-aggregator/internal/model"
)

// Manager 服务管理器
type Manager struct {
	config    *config.Config
	db        *gorm.DB
	portPool  *PortPool
	accounts  map[string]*model.Account
	processes map[string]*exec.Cmd
	mutex     sync.RWMutex
	startTime time.Time
}

// NewManager 创建服务管理器
func NewManager(cfg *config.Config) (*Manager, error) {
	// 初始化数据库
	db, err := initDB(cfg.DB)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %v", err)
	}

	// 创建端口池
	portPool := NewPortPool(cfg.Worker.BasePort, cfg.Worker.BasePort+cfg.Worker.PortRange-1)

	manager := &Manager{
		config:    cfg,
		db:        db,
		portPool:  portPool,
		accounts:  make(map[string]*model.Account),
		processes: make(map[string]*exec.Cmd),
		startTime: time.Now(),
	}

	// 加载现有账号
	if err := manager.loadExistingAccounts(); err != nil {
		log.Printf("Warning: Failed to load existing accounts: %v", err)
	}

	return manager, nil
}

// CreateAccount 创建账号
func (m *Manager) CreateAccount(ctx context.Context, req *model.LoginRequest) (*model.Account, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	// 检查账号是否已存在
	if _, exists := m.accounts[req.AccountID]; exists {
		return nil, fmt.Errorf("account %s already exists", req.AccountID)
	}

	var account *model.Account

	// 检查数据库中是否存在（即使内存中没有）
	var dbAccount model.Account
	if err := m.db.Unscoped().Where("id = ?", req.AccountID).First(&dbAccount).Error; err == nil {
		log.Printf("Account %s found in DB but not in memory, recovering...", req.AccountID)
		account = &dbAccount

		// 恢复软删除
		if account.DeletedAt.Valid {
			account.DeletedAt = gorm.DeletedAt{}
			m.db.Unscoped().Model(account).Update("deleted_at", nil)
		}

		// 更新状态和信息
		account.Status = "creating"
		account.UpdatedAt = time.Now()
		if req.Phone != "" {
			account.Phone = req.Phone
		}

		if err := m.db.Save(account).Error; err != nil {
			return nil, fmt.Errorf("failed to update account: %v", err)
		}

		// 预留端口
		m.portPool.Reserve(account.Port)
	} else {
		// 分配端口
		port, err := m.portPool.Allocate()
		if err != nil {
			return nil, fmt.Errorf("failed to allocate port: %v", err)
		}

		// 创建账号记录
		account = &model.Account{
			ID:         req.AccountID,
			Name:       req.AccountID,
			Phone:      req.Phone,
			Status:     "creating",
			Port:       port,
			ServiceURL: fmt.Sprintf("http://localhost:%d", port),
			CreatedAt:  time.Now(),
			UpdatedAt:  time.Now(),
		}

		// 保存到数据库
		if err := m.db.Create(account).Error; err != nil {
			m.portPool.Release(port)
			return nil, fmt.Errorf("failed to save account: %v", err)
		}
	}

	// 添加到内存
	m.accounts[req.AccountID] = account

	// 启动服务实例
	if err := m.spawnWorker(account); err != nil {
		m.portPool.Release(account.Port)
		delete(m.accounts, req.AccountID)
		// 标记为错误状态而不是删除，以便后续可以重试或排查
		account.Status = "error"
		m.db.Save(account)
		return nil, fmt.Errorf("failed to spawn worker: %v", err)
	}

	m.UpdateAccountStatus(req.AccountID, "running")
	log.Printf("Account %s started on port %d", req.AccountID, account.Port)

	return account, nil
}

// GetAccount 获取账号
func (m *Manager) GetAccount(accountID string) (*model.Account, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	account, exists := m.accounts[accountID]
	if !exists {
		return nil, fmt.Errorf("account %s not found", accountID)
	}

	return account, nil
}

// ListAccounts 列出所有账号
func (m *Manager) ListAccounts() []*model.Account {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	accounts := make([]*model.Account, 0, len(m.accounts))
	for _, account := range m.accounts {
		accounts = append(accounts, account)
	}

	return accounts
}

// StopAccount 停止账号进程（不删除数据）
func (m *Manager) StopAccount(ctx context.Context, accountID string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[accountID]
	if !exists {
		return fmt.Errorf("account %s not found", accountID)
	}

	containerName := fmt.Sprintf("whatsapp-worker-%s", account.ID)
	exec.Command("docker", "rm", "-f", containerName).Run()

	// 更新状态为stopped
	account.Status = "stopped"
	account.UpdatedAt = time.Now()

	// 更新数据库
	if err := m.db.Model(account).Updates(map[string]interface{}{
		"status":     account.Status,
		"updated_at": account.UpdatedAt,
	}).Error; err != nil {
		return fmt.Errorf("failed to update account status: %v", err)
	}

	log.Printf("Account %s stopped successfully", accountID)
	return nil
}

// DeleteAccount 删除账号
func (m *Manager) DeleteAccount(ctx context.Context, accountID string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[accountID]
	if !exists {
		return fmt.Errorf("account %s not found", accountID)
	}

	// 优雅停止
	m.gracefulStop(account)

	containerName := fmt.Sprintf("whatsapp-worker-%s", account.ID)
	exec.Command("docker", "rm", "-f", containerName).Run()

	// 释放端口
	m.portPool.Release(account.Port)

	// 从数据库删除
	if err := m.db.Delete(account).Error; err != nil {
		return fmt.Errorf("failed to delete account from database: %v", err)
	}

	// 从内存删除
	delete(m.accounts, accountID)

	log.Printf("Account %s deleted successfully", accountID)
	return nil
}

// gracefulStop 尝试优雅停止Worker
func (m *Manager) gracefulStop(account *model.Account) {
	if account.ServiceURL == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/api/close", account.ServiceURL), nil)
	http.DefaultClient.Do(req)
}

// StartStatusPoller 启动状态轮询
func (m *Manager) StartStatusPoller(interval time.Duration) {
	// 启动时立即执行一次状态检查
	go m.updateAllAccountStatuses()

	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			m.updateAllAccountStatuses()
		}
	}()
}

func (m *Manager) updateAllAccountStatuses() {
	m.mutex.RLock()
	accounts := make([]*model.Account, 0)
	for _, acc := range m.accounts {
		if acc.Status != "stopped" && acc.Status != "error" {
			accounts = append(accounts, acc)
		}
	}
	m.mutex.RUnlock()

	for _, acc := range accounts {
		go m.checkWorkerStatus(acc)
	}
}

func (m *Manager) checkWorkerStatus(acc *model.Account) {
	workerURL := fmt.Sprintf("%s/api/status", acc.ServiceURL)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", workerURL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		// Connection failed, log it but don't stop immediately unless repeated failures?
		// For now, ignore. The process monitor handles process death.
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return
	}

	// Check status in response
	if statusRaw, ok := result["status"]; ok {
		statusStr, ok := statusRaw.(string)
		if ok && statusStr != "" && statusStr != acc.Status {
			// Avoid updating timestamp if status hasn't changed effectively (e.g. logging noise)
			m.UpdateAccountStatusSafe(acc.ID, statusStr)
		}
	}
}

// UpdateAccountStatus 更新账号状态
func (m *Manager) UpdateAccountStatus(accountID, status string) {
	// 注意：调用此方法前通常需要持有锁，或者在此方法内加锁
	// 由于此方法在其他加锁方法中调用，这里我们假设调用者已经处理好锁的问题
	// 或者我们修改它只在需要时加锁。为安全起见，这里检查一下是否递归锁（Go不支持）。
	// 简单起见，我们假设调用者负责锁，但在StartAccount/CreateAccount中我们是在持有锁时调用的。
	// 但是UpdateAccountStatus的原始实现是有锁的。
	// 如果我们在CreateAccount（持有锁）中调用UpdateAccountStatus（尝试获取锁），会导致死锁。
	// 所以我们需要拆分 UpdateAccountStatusInternal 和 UpdateAccountStatus。

	// 为了避免重构太大，我将在CreateAccount中直接修改状态，只在外部调用时使用UpdateAccountStatus
	// 但上面的代码已经在CreateAccount中调用了UpdateAccountStatus。
	// 让我们修复UpdateAccountStatus，去掉锁，或者创建UpdateAccountStatusSafe。

	// 实际上，为了简单，我会把UpdateAccountStatus的锁去掉，要求调用者加锁。
	// 但这会破坏其他调用。
	// 让我们回退一步：CreateAccount中，我在持有锁。UpdateAccountStatus也加锁。死锁。
	// 我应该在CreateAccount中直接更新内存和DB，不调用UpdateAccountStatus。

	if account, exists := m.accounts[accountID]; exists {
		account.Status = status
		account.UpdatedAt = time.Now()

		// 更新数据库
		m.db.Model(account).Updates(map[string]interface{}{
			"status":     status,
			"updated_at": account.UpdatedAt,
		})
	}
}

// UpdateAccountStatusSafe 线程安全的更新状态
func (m *Manager) UpdateAccountStatusSafe(accountID, status string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.UpdateAccountStatus(accountID, status)
}

// GetHealthStatus 获取健康状态
func (m *Manager) GetHealthStatus() *model.HealthStatus {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	accounts := make([]*model.Account, 0, len(m.accounts))
	runningCount := 0
	loggedInCount := 0

	for _, account := range m.accounts {
		accounts = append(accounts, account)
		if account.Status == "running" {
			runningCount++
		}
		if account.Status == "logged_in" {
			loggedInCount++
		}
	}

	return &model.HealthStatus{
		Status:        "healthy",
		Uptime:        time.Since(m.startTime).String(),
		Accounts:      accounts,
		TotalCount:    len(accounts),
		RunningCount:  runningCount,
		LoggedInCount: loggedInCount,
		SystemInfo: model.SystemInfo{
			WorkerMode:  m.config.Worker.Mode,
			Environment: "development",
			Version:     "1.0.0",
		},
	}
}

// spawnWorker 启动Worker
func (m *Manager) spawnWorker(account *model.Account) error {
	return m.spawnWorkerDocker(account)
}

// spawnWorkerDocker 启动Docker Worker
func (m *Manager) spawnWorkerDocker(account *model.Account) error {
	containerName := fmt.Sprintf("whatsapp-worker-%s", account.ID)

	// Check if container exists
	checkCmd := exec.Command("docker", "ps", "-a", "--filter", fmt.Sprintf("name=^/%s$", containerName), "--format", "{{.ID}}")
	output, _ := checkCmd.Output()

	if len(output) > 0 {
		// Remove existing container
		exec.Command("docker", "rm", "-f", containerName).Run()
	}

	// Prepare Docker run command
	args := []string{
		"run", "-d",
		"--name", containerName,
		"--network", m.config.Worker.Network,
		"-e", fmt.Sprintf("PORT=%d", m.config.Worker.BasePort), // Internal port is usually fixed
		"-e", fmt.Sprintf("ACCOUNT_ID=%s", account.ID),
		"-p", fmt.Sprintf("%d:%d", account.Port, m.config.Worker.BasePort), // Map external port to internal
		// Mount session directory
		"-v", fmt.Sprintf("%s/whatsapp-session/%s:/app/whatsapp-session/%s", os.Getenv("PWD"), account.ID, account.ID),
		m.config.Worker.Image,
	}

	log.Printf("Starting container %s with image %s", containerName, m.config.Worker.Image)
	cmd := exec.Command("docker", args...)
	if combinedOutput, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to start docker container: %v, output: %s", err, string(combinedOutput))
	}

	// Update service URL - for Docker bridge network, localhost + mapped port works for Master outside container
	// If Master is also in Docker, we might need container name + internal port
	// But let's assume Master connects via mapped port for now if running locally
	// Or if Master is in same network, use container name

	// Refine Service URL logic based on deployment
	// If Master is in Docker container in the same network:
	if os.Getenv("DOCKER_ENABLED") == "true" { // or check m.config.Worker.Mode == "docker"
		account.ServiceURL = fmt.Sprintf("http://%s:%d", containerName, m.config.Worker.BasePort)
	} else {
		// Master is local, connect via localhost mapped port
		account.ServiceURL = fmt.Sprintf("http://localhost:%d", account.Port)
	}

	log.Printf("Worker spawned for account %s, ServiceURL: %s", account.ID, account.ServiceURL)

	account.ContainerID = containerName // Store name as ID for now
	m.db.Save(account)

	// Wait for startup
	// time.Sleep(5 * time.Second)
	// Wait for worker to be ready by polling health endpoint
	if err := m.waitForWorkerReady(account.ServiceURL); err != nil {
		return fmt.Errorf("worker failed to become ready: %v", err)
	}
	return nil
}

// waitForWorkerReady 轮询等待Worker准备就绪
func (m *Manager) waitForWorkerReady(serviceURL string) error {
	timeout := time.After(60 * time.Second) // 增加超时时间到 60s，适应 Docker + Proxy 启动慢的情况
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	log.Printf("Waiting for worker at %s to be ready...", serviceURL)

	for {
		select {
		case <-timeout:
			log.Printf("Timeout waiting for worker %s to be ready", serviceURL)
			return fmt.Errorf("timeout waiting for worker to be ready")
		case <-ticker.C:
			resp, err := http.Get(fmt.Sprintf("%s/api/status", serviceURL))
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == 200 {
					log.Printf("Worker at %s is ready!", serviceURL)
					return nil
				}
				log.Printf("Worker at %s returned status %d", serviceURL, resp.StatusCode)
			} else {
				// log.Printf("Worker at %s not ready yet: %v", serviceURL, err) // Optional debug log
			}
		}
	}
}

// StartAccount 启动账号
func (m *Manager) StartAccount(ctx context.Context, accountID string, req *model.PhoneLoginRequest) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[accountID]
	if !exists {
		return fmt.Errorf("account %s not found", accountID)
	}

	// 更新账号状态为启动中
	account.Status = "starting"
	account.UpdatedAt = time.Now()

	// 更新数据库
	m.db.Model(account).Updates(map[string]interface{}{
		"status":     account.Status,
		"updated_at": account.UpdatedAt,
	})

	// 启动Worker实例
	if err := m.spawnWorker(account); err != nil {
		account.Status = "error"
		m.db.Model(account).Updates(map[string]interface{}{"status": "error"})
		return fmt.Errorf("failed to start worker: %v", err)
	}

	account.Status = "running"
	account.UpdatedAt = time.Now()
	m.db.Model(account).Updates(map[string]interface{}{
		"status":     account.Status,
		"updated_at": account.UpdatedAt,
	})
	log.Printf("Account %s started successfully on port %d", accountID, account.Port)

	return nil
}

// LoginToWorker 调用Worker的登录接口
func (m *Manager) LoginToWorker(ctx context.Context, account *model.Account, req *model.PhoneLoginRequest) (map[string]interface{}, error) {
	// 检查Worker是否存活，如果死了尝试重启
	// 注意：这里我们使用一个较短的超时来检查，避免长时间阻塞
	checkCtx, checkCancel := context.WithTimeout(ctx, 2*time.Second)
	defer checkCancel()

	// 简单检查Worker端口是否通，或者直接尝试重启如果之前状态是 error/stopped
	// 但为了更健壮，我们可以在这里调用 spawnWorker 的保护逻辑
	// 如果是Docker模式，spawnWorkerDocker 会检查并重启容器

	// 如果账号状态显示已停止或错误，强制重启
	if account.Status == "stopped" || account.Status == "error" {
		log.Printf("Account %s is in %s state, restarting worker...", account.ID, account.Status)
		if err := m.spawnWorker(account); err != nil {
			return nil, fmt.Errorf("failed to restart worker: %v", err)
		}
	} else {
		// 即使状态是 running，也可能容器已经挂了（手动杀掉的情况）
		// 尝试发一个简单的健康检查请求，如果失败则重启
		healthURL := fmt.Sprintf("%s/api/status", account.ServiceURL)
		healthReq, _ := http.NewRequestWithContext(checkCtx, "GET", healthURL, nil)
		healthResp, err := http.DefaultClient.Do(healthReq)
		if err != nil {
			log.Printf("Worker %s health check failed (%v), restarting...", account.ID, err)
			if err := m.spawnWorker(account); err != nil {
				return nil, fmt.Errorf("failed to restart dead worker: %v", err)
			}
		} else {
			healthResp.Body.Close()
		}
	}

	// 构造Worker登录请求
	workerReq := map[string]interface{}{
		"account_id":  account.ID,
		"signin_type": req.SigninType,
		"login_phone": req.LoginPhone,
		"login_method": func() string {
			if req.SigninType == 40 {
				return "phone"
			}
			return "qr"
		}(),
		"is_cache_login":      req.CacheLogin,
		"hardware_info":       req.HardwareInfo,
		"socks5":              req.ProxyConfig,
		"disable_qr_fallback": true,
	}

	log.Printf("Connecting to worker API: %s/api/login", account.ServiceURL)

	// 序列化请求
	reqBody, err := json.Marshal(workerReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	// 发送HTTP请求到Worker
	workerURL := fmt.Sprintf("%s/api/login", account.ServiceURL)
	// 重试机制，因为进程启动可能需要时间
	var resp *http.Response
	var lastErr error

	// 增加重试次数和间隔，总共等待约 15秒 (之前是 5秒)
	for i := 0; i < 15; i++ {
		httpReq, err := http.NewRequestWithContext(ctx, "POST", workerURL, bytes.NewBuffer(reqBody))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %v", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 60 * time.Second} // 增加请求超时时间
		resp, err = client.Do(httpReq)
		if err == nil {
			break
		}
		lastErr = err
		time.Sleep(1 * time.Second)
	}

	if resp == nil {
		return nil, fmt.Errorf("failed to call worker login API after retries: %v", lastErr)
	}
	defer resp.Body.Close()

	// 读取响应
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %v", err)
	}

	fmt.Printf("[LoginToWorker] Response from %s: %s\n", workerURL, string(respBody))

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v", err)
	}

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		return result, fmt.Errorf("worker login failed with status %d", resp.StatusCode)
	}

	// 更新账号状态
	if success, ok := result["success"].(bool); ok && success {
		m.UpdateAccountStatusSafe(account.ID, "logged_in")
	}

	return result, nil
}

// FindAvailableWorker 查找可用的Worker
func (m *Manager) FindAvailableWorker() *model.Account {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	for _, account := range m.accounts {
		// 查找没有绑定手机号的运行中的Worker
		if account.Status == "running" && account.Phone == "" {
			return account
		}
	}
	return nil
}

// ReuseWorkerForPhone 重用Worker给指定手机号
func (m *Manager) ReuseWorkerForPhone(ctx context.Context, workerID, phone string) (*model.Account, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	// 获取现有Worker
	worker, exists := m.accounts[workerID]
	if !exists {
		return nil, fmt.Errorf("worker %s not found", workerID)
	}

	// 删除旧的Worker记录
	delete(m.accounts, workerID)
	m.db.Delete(worker)

	// 创建新的账号记录，使用手机号作为ID
	newAccount := &model.Account{
		ID:         phone,
		Name:       phone,
		Phone:      phone,
		Status:     worker.Status,
		Port:       worker.Port,
		ServiceURL: worker.ServiceURL,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	// 保存到数据库
	if err := m.db.Create(newAccount).Error; err != nil {
		// 如果失败，恢复原来的Worker
		m.accounts[workerID] = worker
		return nil, fmt.Errorf("failed to save new account: %v", err)
	}

	// 添加到内存
	m.accounts[phone] = newAccount

	log.Printf("Worker %s reused for phone %s on port %d", workerID, phone, newAccount.Port)
	return newAccount, nil
}

// RestartWorkers 重启所有运行中或指定状态的Worker
func (m *Manager) RestartWorkers(ctx context.Context) error {
	m.mutex.RLock()
	accounts := make([]*model.Account, 0)
	for _, acc := range m.accounts {
		// 重启所有账号，包括 stopped/error 的
		accounts = append(accounts, acc)
	}
	m.mutex.RUnlock()

	log.Printf("Restarting %d workers...", len(accounts))
	for _, acc := range accounts {
		log.Printf("Queuing restart for account %s (current status: %s)", acc.ID, acc.Status)
	}

	for _, acc := range accounts {
		// 异步并发重启，避免一个卡住影响所有
		go func(account *model.Account) {
			log.Printf("Restarting worker for account %s...", account.ID)

			// 启动（spawnWorker 会自动处理旧容器清理）
			if err := m.spawnWorker(account); err != nil {
				log.Printf("Failed to restart worker %s: %v", account.ID, err)
				// 标记为错误
				m.UpdateAccountStatusSafe(account.ID, "error")
			} else {
				// 如果成功，spawnWorker 内部可能还没有更新状态为 running (它在 LoginToWorker 或 轮询中更新)
				// 但 spawnWorkerDocker 调用了 waitForWorkerReady，如果返回 nil 说明服务已就绪
				// 我们可以安全地标记为 running (或者保持原有状态，等待轮询更新)
				// 简单起见，如果 waitForWorkerReady 通过，它就是 running
				m.UpdateAccountStatusSafe(account.ID, "running")
			}
		}(acc)
	}
	return nil
}

// RestartAccount 重启单个账号的Worker（用于更新镜像或容器重建）
func (m *Manager) RestartAccount(ctx context.Context, accountID string) error {
	m.mutex.RLock()
	account, exists := m.accounts[accountID]
	m.mutex.RUnlock()
	if !exists {
		return fmt.Errorf("account %s not found", accountID)
	}

	// 直接调用 spawnWorker，它会清理旧容器并重新启动
	if err := m.spawnWorker(account); err != nil {
		m.UpdateAccountStatusSafe(account.ID, "error")
		return fmt.Errorf("failed to restart worker %s: %v", account.ID, err)
	}

	// 标记为运行中
	m.UpdateAccountStatusSafe(account.ID, "running")
	return nil
}

// Close 关闭管理器
func (m *Manager) Close() error {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	log.Println("Manager closed successfully")
	return nil
}

// GetConfig 返回当前配置
func (m *Manager) GetConfig() *config.Config {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return m.config
}

// UpdateConfig 更新配置（仅内存）
func (m *Manager) UpdateConfig(input map[string]interface{}) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	if input == nil {
		return nil
	}
	if serverRaw, ok := input["server"].(map[string]interface{}); ok {
		if host, ok := serverRaw["host"].(string); ok {
			m.config.Server.Host = host
		}
		if port, ok := serverRaw["port"].(float64); ok {
			m.config.Server.Port = int(port)
		}
	}
	if dockerRaw, ok := input["worker"].(map[string]interface{}); ok {
		if mode, ok := dockerRaw["mode"].(string); ok {
			m.config.Worker.Mode = mode
		}
		if network, ok := dockerRaw["network"].(string); ok {
			m.config.Worker.Network = network
		}
		if image, ok := dockerRaw["image"].(string); ok {
			m.config.Worker.Image = image
		}
		if basePort, ok := dockerRaw["basePort"].(float64); ok {
			m.config.Worker.BasePort = int(basePort)
		}
		if portRange, ok := dockerRaw["portRange"].(float64); ok {
			m.config.Worker.PortRange = int(portRange)
		}
		if namespace, ok := dockerRaw["namespace"].(string); ok {
			m.config.Worker.Namespace = namespace
		}
	}
	if dbRaw, ok := input["db"].(map[string]interface{}); ok {
		if typ, ok := dbRaw["type"].(string); ok {
			m.config.DB.Type = typ
		}
		if name, ok := dbRaw["name"].(string); ok {
			m.config.DB.Name = name
		}
	}
	return nil
}

// loadExistingAccounts 加载现有账号
func (m *Manager) loadExistingAccounts() error {
	var accounts []*model.Account
	if err := m.db.Find(&accounts).Error; err != nil {
		return err
	}

	log.Printf("Loaded %d existing accounts:", len(accounts))
	for _, account := range accounts {
		log.Printf(" - Account %s (Status: %s)", account.ID, account.Status)
		// 不重置状态为stopped，保留原始状态，以便Master重启后可以通过轮询恢复连接
		// account.Status = "stopped"
		// m.db.Model(account).Update("status", "stopped")

		m.accounts[account.ID] = account
		// 预留端口
		m.portPool.Reserve(account.Port)
	}
	return nil
}

// initDB 初始化数据库
func initDB(cfg config.DBConfig) (*gorm.DB, error) {
	var db *gorm.DB
	var err error

	switch cfg.Type {
	case "sqlite":
		db, err = gorm.Open(sqlite.Open(cfg.Name), &gorm.Config{})
	default:
		return nil, fmt.Errorf("unsupported database type: %s", cfg.Type)
	}

	if err != nil {
		return nil, err
	}

	// 自动迁移
	if err := db.AutoMigrate(&model.Account{}); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %v", err)
	}

	return db, nil
}
