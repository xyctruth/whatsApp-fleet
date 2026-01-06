package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "whatsapp-aggregator/docs"
	"whatsapp-aggregator/internal/middleware"
	"whatsapp-aggregator/internal/model"
	"whatsapp-aggregator/internal/service"
)

// Handler HTTP处理器
type Handler struct {
	manager *service.Manager
}

// NewHandler 创建处理器
func NewHandler(manager *service.Manager) *Handler {
	return &Handler{
		manager: manager,
	}
}

// CreateAccount 创建账号
// @Summary Create Account
// @Description Create a new WhatsApp account worker
// @Tags Account
// @Accept json
// @Produce json
// @Param request body model.LoginRequest true "Login Request"
// @Success 200 {object} model.APIResponse
// @Router /accounts [post]
func (h *Handler) CreateAccount(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Invalid request format",
			Error:   err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	account, err := h.manager.CreateAccount(ctx, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.APIResponse{
			Success: false,
			Message: "Failed to create account",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Account created successfully",
		Data:    account,
	})
}

// GetAccount 获取账号信息
// @Summary Get Account
// @Description Get account details by ID
// @Tags Account
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id} [get]
func (h *Handler) GetAccount(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Account ID is required",
		})
		return
	}

	account, err := h.manager.GetAccount(accountID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.APIResponse{
			Success: false,
			Message: "Account not found",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Account retrieved successfully",
		Data:    account,
	})
}

// ListAccounts 列出所有账号
// @Summary List Accounts
// @Description Get all registered accounts
// @Tags Account
// @Produce json
// @Success 200 {object} model.APIResponse
// @Router /accounts [get]
func (h *Handler) ListAccounts(c *gin.Context) {
	accounts := h.manager.ListAccounts()

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Accounts retrieved successfully",
		Data:    accounts,
	})
}

// DeleteAccount 删除账号
// @Summary Delete Account
// @Description Delete an account by ID
// @Tags Account
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id} [delete]
func (h *Handler) DeleteAccount(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Account ID is required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if err := h.manager.DeleteAccount(ctx, accountID); err != nil {
		c.JSON(http.StatusInternalServerError, model.APIResponse{
			Success: false,
			Message: "Failed to delete account",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Account deleted successfully",
	})
}

// SendMessage 发送消息
// @Summary Send Message
// @Description Send a WhatsApp message
// @Tags Message
// @Accept json
// @Produce json
// @Param request body model.MessageRequest true "Message Request"
// @Success 200 {object} model.APIResponse
// @Router /send-message [post]
func (h *Handler) SendMessage(c *gin.Context) {
	var req model.MessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Invalid request format",
			Error:   err.Error(),
		})
		return
	}

	// 获取账号信息
	account, err := h.manager.GetAccount(req.AccountID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.APIResponse{
			Success: false,
			Message: "Account not found",
			Error:   err.Error(),
		})
		return
	}

	// 构造发送给Worker的请求
	workerReq := map[string]string{
		"contact": req.Contact,
		"message": req.Message,
	}
	jsonBody, _ := json.Marshal(workerReq)

	// 发送请求到Worker
	targetURL := fmt.Sprintf("%s/api/send-message", account.ServiceURL)
	resp, err := http.Post(targetURL, "application/json", bytes.NewBuffer(jsonBody))
	if err != nil {
		c.JSON(http.StatusBadGateway, model.APIResponse{
			Success: false,
			Message: "Failed to connect to worker",
			Error:   err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// 复制Worker的响应
	c.Status(resp.StatusCode)
	for k, v := range resp.Header {
		c.Writer.Header()[k] = v
	}
	io.Copy(c.Writer, resp.Body)

	// 更新统计信息（异步）
	go func() {
		if resp.StatusCode == http.StatusOK {
			// 这里应该有更好的方式更新统计，但暂时这样
			account.MessagesSent++
			now := time.Now()
			account.LastActivity = &now
			h.manager.UpdateAccountStatusSafe(account.ID, account.Status)
		}
	}()
}

// GetContacts 获取联系人
// @Summary Get Contacts
// @Description Get contacts for a specific account
// @Tags Contact
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/contacts [get]
func (h *Handler) GetContacts(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/contacts")
}

// GetMessages 获取消息
// @Summary Get Messages
// @Description Get recent messages for a specific account
// @Tags Message
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/messages [get]
func (h *Handler) GetMessages(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/messages")
}

// GetAccountStatus 获取账号状态
// @Summary Get Account Status
// @Description Get status for a specific account
// @Tags Account
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/status [get]
func (h *Handler) GetAccountStatus(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/status")
}

// GetQRCode 获取二维码
// @Summary Get QR Code
// @Description Get QR code for a specific account
// @Tags Auth
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/qr-code [get]
func (h *Handler) GetQRCode(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/qr-code")
}

// @Summary Get Logs
// @Description Get logs for a specific account
// @Tags System
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/logs [get]
func (h *Handler) GetLogs(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/logs")
}

// @Summary Get Debug Info
// @Description Get debug info for a specific account
// @Tags Debug
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/debug [get]
func (h *Handler) GetDebug(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/debug")
}

// @Summary Refresh Login
// @Description Refresh login session
// @Tags Auth
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/login/refresh [post]
func (h *Handler) RefreshLogin(c *gin.Context) {
	accountID := c.Param("id")
	// 注意：这里需要POST请求，proxyToWorker会使用原始请求的方法
	h.proxyToWorker(c, accountID, "/api/login/refresh")
}

// CheckLoginStatus 检查登录状态
// @Summary Check Login Status
// @Description Check login status for a specific account
// @Tags Auth
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/login/status [get]
func (h *Handler) CheckLoginStatus(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/login/status")
}

// @Summary Phone Login
// @Description Login with phone number
// @Tags Auth
// @Accept json
// @Produce json
// @Param request body model.PhoneLoginRequest true "Phone Login Request"
// @Success 200 {object} model.APIResponse
// @Router /phone-login [post]
func (h *Handler) PhoneLogin(c *gin.Context) {
	// Read body for logging
	bodyBytes, _ := io.ReadAll(c.Request.Body)
	// Restore body
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	fmt.Printf("\n====== [PhoneLogin] Request Body ======\n%s\n======================================\n", string(bodyBytes))

	var req model.PhoneLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fmt.Printf("[PhoneLogin] BindJSON Error: %v\n", err)
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Invalid request format",
			Error:   err.Error(),
		})
		return
	}

	fmt.Printf("[PhoneLogin] Parsed Request: %+v\n", req)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// 使用手机号作为账号ID
	accountID := req.LoginPhone

	// 检查是否已存在该手机号的Worker
	account, err := h.manager.GetAccount(accountID)
	if err != nil {
		// 账号不存在，检查是否有可用的Worker可以重用
		availableAccount := h.manager.FindAvailableWorker()
		if availableAccount != nil {
			// 重用现有Worker，更新其信息
			account, err = h.manager.ReuseWorkerForPhone(ctx, availableAccount.ID, req.LoginPhone)
			if err != nil {
				c.JSON(http.StatusInternalServerError, model.APIResponse{
					Success: false,
					Message: "Failed to reuse existing worker",
					Error:   err.Error(),
				})
				return
			}
		} else {
			// 没有可用Worker，创建新的
			// Convert HardwareInfo to map[string]interface{}
			// Since we changed HardwareInfo to struct, we can convert it directly
			hwInfoMap := map[string]interface{}{
				"os":      req.HardwareInfo.OS,
				"browser": req.HardwareInfo.Browser,
			}

			// ProxyConfig is already struct, we can use it directly or convert pointer
			// CreateAccount expects *ProxyConfig
			proxyCfg := &req.ProxyConfig

			loginReq := &model.LoginRequest{
				AccountID:    accountID,
				LoginMethod:  "phone",
				Phone:        req.LoginPhone,
				HardwareInfo: hwInfoMap,
				CacheLogin:   req.CacheLogin,
				ProxyConfig:  proxyCfg,
			}

			account, err = h.manager.CreateAccount(ctx, loginReq)
			if err != nil {
				c.JSON(http.StatusInternalServerError, model.APIResponse{
					Success: false,
					Message: "Failed to create worker for phone number",
					Error:   err.Error(),
				})
				return
			}
		}
	} else {
		// 账号已存在，启动Worker
		if account.Status != "running" && account.Status != "logged_in" {
			err = h.manager.StartAccount(ctx, accountID, &req)
			if err != nil {
				log.Printf("[PhoneLogin] StartAccount Error: %v", err)
				c.JSON(http.StatusInternalServerError, model.APIResponse{
					Success: false,
					Message: "Failed to start existing worker",
					Error:   err.Error(),
				})
				return
			}
		}
	}

	// Call worker login interface
	loginResult, err := h.manager.LoginToWorker(ctx, account, &req)
	if err != nil {
		log.Printf("[PhoneLogin] LoginToWorker Error: %v", err)
		c.JSON(http.StatusInternalServerError, model.APIResponse{
			Success: false,
			Message: "Failed to login to WhatsApp",
			Error:   err.Error(),
		})
		return
	}

	resp := model.APIResponse{
		Success: true,
		Message: "Login initiated successfully",
		Data: map[string]interface{}{
			"account":      account,
			"login_result": loginResult,
		},
	}
	// Log response
	respBytes, _ := json.Marshal(resp)
	log.Printf("[PhoneLogin] Response: %s", string(respBytes))

	c.JSON(http.StatusOK, resp)
}

// @Summary Get Health Status
// @Description Check system health status
// @Tags System
// @Produce json
// @Success 200 {object} model.APIResponse
// @Router /health [get]
func (h *Handler) GetHealth(c *gin.Context) {
	health := h.manager.GetHealthStatus()

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Health status retrieved successfully",
		Data:    health,
	})
}

// @Summary Get System Stats
// @Description Get system statistics
// @Tags System
// @Produce json
// @Success 200 {object} model.APIResponse
// @Router /stats [get]
func (h *Handler) GetStats(c *gin.Context) {
	workers := h.manager.ListAccounts()
	total := len(workers)
	online := 0
	messagesSent := 0
	for _, w := range workers {
		if w.Status == "logged_in" || w.Status == "running" {
			online++
		}
		messagesSent += w.MessagesSent
	}
	stats := map[string]interface{}{
		"totalWorkers":   total,
		"onlineWorkers":  online,
		"todayMessages":  messagesSent,
		"activeContacts": 0,
	}
	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Stats retrieved successfully",
		Data:    stats,
	})
}

// @Summary Get Config
// @Description Get current system configuration
// @Tags System
// @Produce json
// @Success 200 {object} model.APIResponse
// @Router /config [get]
func (h *Handler) GetConfig(c *gin.Context) {
	cfg := h.manager.GetConfig()
	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Config retrieved successfully",
		Data:    cfg,
	})
}

// @Summary Update Config
// @Description Update system configuration
// @Tags System
// @Accept json
// @Produce json
// @Param request body map[string]interface{} true "Configuration"
// @Success 200 {object} model.APIResponse
// @Router /config [put]
func (h *Handler) UpdateConfig(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Invalid request format",
			Error:   err.Error(),
		})
		return
	}
	if err := h.manager.UpdateConfig(input); err != nil {
		c.JSON(http.StatusInternalServerError, model.APIResponse{
			Success: false,
			Message: "Failed to update config",
			Error:   err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Config updated successfully",
	})
}

// Dashboard 管理面板
func (h *Handler) Dashboard(c *gin.Context) {
	// 简单的HTML响应，暂时不使用模板
	html := `<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Multi-Service Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f0f2f5; }
        .header { background: #25D366; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .section { background: white; margin: 20px 0; padding: 25px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .btn { background: #25D366; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; margin-right: 10px; }
        .btn:hover { background: #128C7E; }
        .api-card { border: 1px solid #e1e4e8; border-radius: 6px; margin-bottom: 15px; overflow: hidden; }
        .api-header { background: #f6f8fa; padding: 10px 15px; font-weight: bold; border-bottom: 1px solid #e1e4e8; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .method { display: inline-block; padding: 3px 8px; border-radius: 4px; color: white; font-size: 12px; margin-right: 10px; min-width: 50px; text-align: center; }
        .get { background-color: #61affe; }
        .post { background-color: #49cc90; }
        .put { background-color: #fca130; }
        .delete { background-color: #f93e3e; }
        .api-body { padding: 15px; display: none; background: #fff; }
        .code-block { background: #282c34; color: #abb2bf; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; margin: 10px 0; font-size: 13px; position: relative; }
        .copy-btn { position: absolute; top: 5px; right: 5px; background: rgba(255,255,255,0.2); color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; }
        h2 { color: #128C7E; border-bottom: 2px solid #25D366; padding-bottom: 10px; margin-top: 0; }
    </style>
    <script>
        function toggleApi(id) {
            var el = document.getElementById(id);
            if (el.style.display === 'block') {
                el.style.display = 'none';
            } else {
                el.style.display = 'block';
            }
        }
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(function() {
                alert('Copied to clipboard!');
            }, function(err) {
                console.error('Could not copy text: ', err);
            });
        }
    </script>
</head>
<body>
    <div class="header">
        <h1>📱 WhatsApp Multi-Service Dashboard</h1>
        <p>统一管理多个WhatsApp账号实例</p>
    </div>
    
    <div class="section">
        <h2>🚀 常用链接</h2>
        <div style="margin-top: 20px;">
            <a href="/api/v1/health" target="_blank" class="btn">系统健康状态</a>
            <a href="/api/v1/accounts" target="_blank" class="btn">查看所有账号</a>
            <a href="/swagger/index.html" target="_blank" class="btn">Swagger API 文档</a>
        </div>
    </div>
    
    <div class="section">
        <h2>📚 API 调用示例</h2>
        <p>点击下方接口查看详细调用示例（使用 curl 格式）：</p>

        <!-- 1. Phone Login -->
        <div class="api-card">
            <div class="api-header" onclick="toggleApi('api-login')">
                <div><span class="method post">POST</span> /api/v1/phone-login</div>
                <span>手机号登录</span>
            </div>
            <div id="api-login" class="api-body">
                <p>启动一个新的 WhatsApp 实例并使用手机号登录。</p>
                <div class="code-block">
                    <button class="copy-btn" onclick="copyToClipboard(this.parentElement.innerText)">Copy</button>
curl -X POST http://localhost:8080/api/v1/phone-login \
  -H "Content-Type: application/json" \
  -d '{
    "login_phone": "8613800138000",
    "signin_type": 40,
    "hardware_info": {
        "os": "MacOS",
        "browser": "Chrome"
    },
    "socks5": {
        "ip": "127.0.0.1",
        "port": 7890,
        "username": "",
        "password": ""
    }
}'
                </div>
            </div>
        </div>

        <!-- 2. Get Accounts -->
        <div class="api-card">
            <div class="api-header" onclick="toggleApi('api-list')">
                <div><span class="method get">GET</span> /api/v1/accounts</div>
                <span>获取账号列表</span>
            </div>
            <div id="api-list" class="api-body">
                <p>列出当前系统中所有管理的账号及其状态。</p>
                <div class="code-block">
                    <button class="copy-btn" onclick="copyToClipboard(this.parentElement.innerText)">Copy</button>
curl http://localhost:8080/api/v1/accounts
                </div>
            </div>
        </div>

        <!-- 3. Send Message -->
        <div class="api-card">
            <div class="api-header" onclick="toggleApi('api-send')">
                <div><span class="method post">POST</span> /api/v1/send-message</div>
                <span>发送消息</span>
            </div>
            <div id="api-send" class="api-body">
                <p>使用指定账号发送文本消息。</p>
                <div class="code-block">
                    <button class="copy-btn" onclick="copyToClipboard(this.parentElement.innerText)">Copy</button>
curl -X POST http://localhost:8080/api/v1/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "8613800138000",
    "contact": "8613900139000",
    "message": "Hello from WhatsApp Multi-Service!"
}'
                </div>
            </div>
        </div>

        <!-- 4. Switch Proxy -->
        <div class="api-card">
            <div class="api-header" onclick="toggleApi('api-proxy')">
                <div><span class="method post">POST</span> /api/v1/accounts/{id}/proxy/switch</div>
                <span>切换代理</span>
            </div>
            <div id="api-proxy" class="api-body">
                <p>为指定账号切换代理配置。</p>
                <div class="code-block">
                    <button class="copy-btn" onclick="copyToClipboard(this.parentElement.innerText)">Copy</button>
curl -X POST http://localhost:8080/api/v1/accounts/8613800138000/proxy/switch \
  -H "Content-Type: application/json" \
  -d '{
    "ip": "192.168.1.100",
    "port": 1080,
    "username": "user",
    "password": "pass",
    "protocol": "socks5"
}'
                </div>
            </div>
        </div>

        <!-- 5. Stop Account -->
        <div class="api-card">
            <div class="api-header" onclick="toggleApi('api-stop')">
                <div><span class="method post">POST</span> /api/v1/accounts/{id}/stop</div>
                <span>停止账号服务</span>
            </div>
            <div id="api-stop" class="api-body">
                <p>停止指定账号的 Worker 进程或容器。</p>
                <div class="code-block">
                    <button class="copy-btn" onclick="copyToClipboard(this.parentElement.innerText)">Copy</button>
curl -X POST http://localhost:8080/api/v1/accounts/8613800138000/stop
                </div>
            </div>
        </div>
        
         <!-- 6. Get QR Code -->
        <div class="api-card">
            <div class="api-header" onclick="toggleApi('api-qr')">
                <div><span class="method get">GET</span> /api/v1/accounts/{id}/qr-code</div>
                <span>获取登录二维码</span>
            </div>
            <div id="api-qr" class="api-body">
                <p>获取指定账号的登录二维码（如果是扫码登录模式）。</p>
                <div class="code-block">
                    <button class="copy-btn" onclick="copyToClipboard(this.parentElement.innerText)">Copy</button>
curl http://localhost:8080/api/v1/accounts/8613800138000/qr-code
                </div>
            </div>
        </div>

    </div>
</body>
</html>`
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
}

// @Summary Get Proxy Status
// @Description Get proxy status for an account
// @Tags Proxy
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/proxy/status [get]
func (h *Handler) GetProxyStatus(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/proxy/status")
}

// @Summary Switch Proxy
// @Description Switch proxy for an account
// @Tags Proxy
// @Produce json
// @Param id path string true "Account ID"
// @Param request body model.ProxyConfig true "Proxy Config"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/proxy/switch [post]
func (h *Handler) SwitchProxy(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/proxy/switch")
}

// @Summary Get External IP
// @Description Get external IP via proxy
// @Tags Proxy
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/proxy/external-ip [get]
func (h *Handler) GetExternalIP(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/proxy/external-ip")
}

// @Summary Detect Proxy
// @Description Detect if proxy is working
// @Tags Proxy
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/proxy/detect [get]
func (h *Handler) DetectProxy(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/proxy/detect")
}

// @Summary Get Debug HTML
// @Description Get debug HTML of the page
// @Tags Debug
// @Produce html
// @Param id path string true "Account ID"
// @Success 200 {string} string
// @Router /accounts/{id}/debug/html [get]
func (h *Handler) GetDebugHTML(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/debug/html")
}

// @Summary Get Debug Elements
// @Description Get debug elements of the page
// @Tags Debug
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/debug/elements [get]
func (h *Handler) GetDebugElements(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/debug/elements")
}

// @Summary Check Messages
// @Description Manually trigger message check
// @Tags Debug
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/debug/check-messages [post]
func (h *Handler) CheckMessages(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/debug/check-messages")
}

// @Summary Logout
// @Description Logout from WhatsApp
// @Tags Auth
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/logout [post]
func (h *Handler) Logout(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/logout")
}

// @Summary Create Group
// @Description Create a new group
// @Tags Group
// @Accept json
// @Produce json
// @Param id path string true "Account ID"
// @Param request body map[string]interface{} true "Group Info"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/groups [post]
func (h *Handler) CreateGroup(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/groups/create")
}

// @Summary Add Group Participants
// @Description Add participants to a group
// @Tags Group
// @Accept json
// @Produce json
// @Param id path string true "Account ID"
// @Param request body map[string]interface{} true "Participants Info"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/groups/participants [post]
func (h *Handler) AddGroupParticipants(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/groups/participants/add")
}

// @Summary Close Account
// @Description Close the account session
// @Tags Account
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/close [post]
func (h *Handler) CloseAccount(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/close")
}

// AddContact 添加联系人
// @Summary Add Contact
// @Description Add a new contact to the account
// @Tags Contact
// @Accept json
// @Produce json
// @Param id path string true "Account ID"
// @Param request body map[string]string true "Contact Info"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/contacts [post]
func (h *Handler) AddContact(c *gin.Context) {
	accountID := c.Param("id")
	h.proxyToWorker(c, accountID, "/api/contacts/add")
}

// StopAccount 停止账号服务
// @Summary Stop Account Service
// @Description Stop the worker process for an account
// @Tags Account
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/stop [post]
func (h *Handler) StopAccount(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Account ID is required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()

	if err := h.manager.StopAccount(ctx, accountID); err != nil {
		c.JSON(http.StatusInternalServerError, model.APIResponse{
			Success: false,
			Message: "Failed to stop account",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Account stopped successfully",
	})
}

// RestartAccount 重启指定账号的Worker
// @Summary Restart Account Worker
// @Description Restart the worker container/process for an account (e.g., after image update)
// @Tags Account
// @Produce json
// @Param id path string true "Account ID"
// @Success 200 {object} model.APIResponse
// @Router /accounts/{id}/restart [post]
func (h *Handler) RestartAccount(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Success: false,
			Message: "Account ID is required",
		})
		return
	}

	// 异步执行以避免阻塞请求
	go func(id string) {
		ctx := context.Background()
		if err := h.manager.RestartAccount(ctx, id); err != nil {
			log.Printf("Failed to restart account %s: %v", id, err)
		}
	}(accountID)

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Account restart triggered",
	})
}

// RestartWorkers 重启所有Workers
// @Summary Restart All Workers
// @Description Restart all active workers (e.g. after image update)
// @Tags System
// @Produce json
// @Success 200 {object} model.APIResponse
// @Router /system/restart-workers [post]
func (h *Handler) RestartWorkers(c *gin.Context) {
	// 异步执行，避免阻塞HTTP请求
	go func() {
		ctx := context.Background()
		if err := h.manager.RestartWorkers(ctx); err != nil {
			log.Printf("Error restarting workers: %v", err)
		}
	}()

	c.JSON(http.StatusOK, model.APIResponse{
		Success: true,
		Message: "Workers restart triggered in background",
	})
}

// SetupRoutes 设置路由
func (h *Handler) SetupRoutes() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// 添加日志中间件
	r.Use(middleware.RequestLogger())

	// 静态文件服务
	r.Static("/static", "web/static")

	// API路由
	api := r.Group("/api/v1")
	{
		// 账号管理
		api.POST("/accounts", h.CreateAccount)
		api.GET("/accounts", h.ListAccounts)
		api.GET("/accounts/:id", h.GetAccount)
		api.DELETE("/accounts/:id", h.DeleteAccount)

		// 登录管理
		api.POST("/phone-login", h.PhoneLogin)

		// WhatsApp操作
		api.POST("/send-message", h.SendMessage)
		api.GET("/accounts/:id/contacts", h.GetContacts)
		api.POST("/accounts/:id/contacts", h.AddContact)
		api.GET("/accounts/:id/messages", h.GetMessages)
		api.GET("/accounts/:id/status", h.GetAccountStatus)
		api.GET("/accounts/:id/qr-code", h.GetQRCode)
		api.GET("/accounts/:id/logs", h.GetLogs)
		api.GET("/accounts/:id/debug", h.GetDebug)
		api.GET("/accounts/:id/debug/html", h.GetDebugHTML)
		api.GET("/accounts/:id/login/status", h.CheckLoginStatus)
		api.POST("/accounts/:id/login/refresh", h.RefreshLogin)
		api.POST("/accounts/:id/logout", h.Logout)
		api.POST("/accounts/:id/close", h.CloseAccount)
		api.POST("/accounts/:id/stop", h.StopAccount)
		api.POST("/accounts/:id/restart", h.RestartAccount)

		// 群组管理
		api.POST("/accounts/:id/groups", h.CreateGroup)
		api.POST("/accounts/:id/groups/participants", h.AddGroupParticipants)

		// 代理管理
		api.GET("/accounts/:id/proxy/status", h.GetProxyStatus)
		api.POST("/accounts/:id/proxy/switch", h.SwitchProxy)
		api.GET("/accounts/:id/proxy/external-ip", h.GetExternalIP)
		api.GET("/accounts/:id/proxy/detect", h.DetectProxy)

		// 调试工具
		api.GET("/accounts/:id/debug/elements", h.GetDebugElements)
		api.POST("/accounts/:id/debug/check-messages", h.CheckMessages)

		// 系统状态
		api.GET("/health", h.GetHealth)
		api.GET("/stats", h.GetStats)
		api.GET("/config", h.GetConfig)
		api.PUT("/config", h.UpdateConfig)

	// 系统管理
	api.POST("/system/restart-workers", h.RestartWorkers)
	}

	// Swagger文档 (移回根路径以便更好兼容gin-swagger默认行为)
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// Web界面
	r.GET("/", h.Dashboard)
	r.GET("/dashboard", h.Dashboard)

	return r
}

// proxyToWorker 转发请求到Worker
func (h *Handler) proxyToWorker(c *gin.Context, accountID string, workerPath string) {
	account, err := h.manager.GetAccount(accountID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.APIResponse{
			Success: false,
			Message: "Account not found",
			Error:   err.Error(),
		})
		return
	}

	targetURL := fmt.Sprintf("%s%s", account.ServiceURL, workerPath)

	// 如果是GET请求，附带Query参数
	if c.Request.Method == http.MethodGet {
		if c.Request.URL.RawQuery != "" {
			targetURL += "?" + c.Request.URL.RawQuery
		}
	}

	req, err := http.NewRequest(c.Request.Method, targetURL, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.APIResponse{
			Success: false,
			Message: "Failed to create proxy request",
			Error:   err.Error(),
		})
		return
	}

	// Copy headers
	for k, v := range c.Request.Header {
		// 跳过一些不应该转发的头
		if k == "Host" || k == "Content-Length" || k == "If-None-Match" || k == "If-Modified-Since" {
			continue
		}
		req.Header[k] = v
	}

	// 强制禁用缓存
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, model.APIResponse{
			Success: false,
			Message: "Failed to connect to worker",
			Error:   err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// 复制Worker的响应
	c.Status(resp.StatusCode)
	for k, v := range resp.Header {
		c.Writer.Header()[k] = v
	}

	// 读取响应体以进行状态更新
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		// 如果读取失败，至少尽力转发（虽然可能已经部分写入了）
		// 但由于我们还没写入ResponseWriter，所以这里可以返回错误
		c.JSON(http.StatusInternalServerError, model.APIResponse{
			Success: false,
			Message: "Failed to read worker response",
			Error:   err.Error(),
		})
		return
	}

	// 写入响应到客户端
	c.Writer.Write(bodyBytes)

	// 如果请求是获取状态，尝试更新本地状态
	if workerPath == "/api/status" || workerPath == "/api/login/status" {
		var result map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &result); err == nil {
			// 尝试获取 status 字段
			var statusStr string

			// 检查直接的 status 字段
			if s, ok := result["status"].(string); ok {
				statusStr = s
			} else if data, ok := result["data"].(map[string]interface{}); ok {
				// 检查 data.status
				if s, ok := data["status"].(string); ok {
					statusStr = s
				}
			}

			if statusStr != "" && statusStr != account.Status {
				h.manager.UpdateAccountStatusSafe(accountID, statusStr)
			}
		}
	}
}
