package config

import (
	"os"
	"strconv"
)

// Config 应用配置
type Config struct {
	Server ServerConfig
	Worker WorkerConfig
	DB     DBConfig
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Host string
	Port int
}

// WorkerConfig Worker运行模式配置
type WorkerConfig struct {
	Mode      string // local, docker, k8s
	Network   string // for docker
	Image     string // for docker/k8s
	BasePort  int    // for local/docker
	PortRange int    // for local/docker
	Namespace string // for k8s
}

// DBConfig 数据库配置
type DBConfig struct {
	Type string
	Name string
}

// Load 加载配置
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Host: getEnv("SERVER_HOST", "0.0.0.0"),
			Port: getEnvInt("SERVER_PORT", 8080),
		},
		Worker: WorkerConfig{
			Mode:      getEnv("WORKER_MODE", "local"),
			Network:   getEnv("DOCKER_NETWORK", "whatsapp-network"),
			Image:     getEnv("WHATSAPP_IMAGE", "whatsapp-node-service:latest"),
			BasePort:  getEnvInt("WORKER_BASE_PORT", 4000),
			PortRange: getEnvInt("WORKER_PORT_RANGE", 1000),
			Namespace: getEnv("K8S_NAMESPACE", "whatsapp"),
		},
		DB: DBConfig{
			Type: getEnv("DB_TYPE", "sqlite"),
			Name: getEnv("DB_NAME", "./data/whatsapp_aggregator.db"),
		},
	}
}

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvInt 获取整型环境变量
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

// getEnvBool 获取布尔型环境变量
func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}
