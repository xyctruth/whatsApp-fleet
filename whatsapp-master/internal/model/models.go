package model

import (
	"time"

	"gorm.io/gorm"
)

// Account WhatsApp账号模型
type Account struct {
	ID               string         `json:"id" gorm:"primaryKey"`
	Name             string         `json:"name"`
	Phone            string         `json:"phone"`
	Status           string         `json:"status"` // creating, starting, running, stopping, stopped, error, logged_in, logged_out
	ServiceURL       string         `json:"service_url"`
	ContainerID      string         `json:"container_id,omitempty"`
	PodName          string         `json:"pod_name,omitempty"`
	Port             int            `json:"port"`
	MessagesSent     int            `json:"messages_sent"`
	MessagesReceived int            `json:"messages_received"`
	LastActivity     *time.Time     `json:"last_activity,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `json:"-" gorm:"index"`
}

// LoginRequest 登录请求模型
type LoginRequest struct {
	AccountID    string                 `json:"account_id" binding:"required"`
	LoginMethod  string                 `json:"login_method"` // qr, phone
	Phone        string                 `json:"phone,omitempty"`
	HardwareInfo map[string]interface{} `json:"hardware_info,omitempty"`
	CacheLogin   bool                   `json:"cache_login"`
	ProxyConfig  *ProxyConfig           `json:"proxy_config,omitempty"`
}

// PhoneLoginRequest 手机号登录请求模型
type PhoneLoginRequest struct {
	LoginPhone   string       `json:"login_phone" binding:"required"`
	SigninType   int          `json:"signin_type"` // 30: qr, 40: phone
	HardwareInfo HardwareInfo `json:"hardware_info,omitempty"`
	CacheLogin   bool         `json:"is_cache_login"`
	ProxyConfig  ProxyConfig  `json:"socks5,omitempty"`
}

// HardwareInfo 硬件信息模型
type HardwareInfo struct {
	OS      string `json:"os"`
	Browser string `json:"browser"`
}

// ProxyConfig 代理配置模型
type ProxyConfig struct {
	IP           string `json:"ip"`
	Port         int    `json:"port"`
	Username     string `json:"username,omitempty"`
	Password     string `json:"password,omitempty"`
	Region       string `json:"region,omitempty"`
	ResourceCode string `json:"resource_code,omitempty"`
	ResourceName string `json:"resource_name,omitempty"`
}

// MessageRequest 消息请求模型
type MessageRequest struct {
	AccountID string `json:"account_id" binding:"required"`
	Contact   string `json:"contact" binding:"required"`
	Message   string `json:"message" binding:"required"`
}

// APIResponse 统一API响应模型
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// HealthStatus 健康状态模型
type HealthStatus struct {
	Status        string     `json:"status"`
	Uptime        string     `json:"uptime"`
	Accounts      []*Account `json:"accounts"`
	TotalCount    int        `json:"total_count"`
	RunningCount  int        `json:"running_count"`
	LoggedInCount int        `json:"logged_in_count"`
	SystemInfo    SystemInfo `json:"system_info"`
}

// SystemInfo 系统信息模型
type SystemInfo struct {
	WorkerMode  string `json:"worker_mode"`
	Environment string `json:"environment"`
	Version     string `json:"version"`
}

// AccountStats 账号统计模型
type AccountStats struct {
	TotalAccounts    int `json:"total_accounts"`
	RunningAccounts  int `json:"running_accounts"`
	LoggedInAccounts int `json:"logged_in_accounts"`
	TotalMessages    int `json:"total_messages"`
}

// ContainerInfo 容器信息模型
type ContainerInfo struct {
	ID     string            `json:"id"`
	Name   string            `json:"name"`
	Status string            `json:"status"`
	Ports  map[string]string `json:"ports"`
	Labels map[string]string `json:"labels"`
}

// PodInfo Pod信息模型
type PodInfo struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Status    string            `json:"status"`
	IP        string            `json:"ip"`
	Labels    map[string]string `json:"labels"`
}

// ServiceInstance 服务实例模型
type ServiceInstance struct {
	AccountID  string    `json:"account_id"`
	Type       string    `json:"type"`       // docker, k8s
	Identifier string    `json:"identifier"` // container_id or pod_name
	ServiceURL string    `json:"service_url"`
	Status     string    `json:"status"`
	Port       int       `json:"port"`
	CreatedAt  time.Time `json:"created_at"`
}

// TableName 指定表名
func (Account) TableName() string {
	return "accounts"
}
