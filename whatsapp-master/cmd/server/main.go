package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"whatsapp-aggregator/internal/config"
	"whatsapp-aggregator/internal/handler"
	"whatsapp-aggregator/internal/service"
)

// @title WhatsApp Aggregator API
// @version 1.0
// @description API for WhatsApp Multi-Service Aggregator
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.swagger.io/support
// @contact.email support@swagger.io

// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html

// @host localhost:8080
// @BasePath /api/v1
func main() {
	// 加载配置
	cfg := config.Load()

	// 创建服务管理器
	manager, err := service.NewManager(cfg)
	if err != nil {
		log.Fatalf("Failed to create service manager: %v", err)
	}
	defer manager.Close()

	manager.StartStatusPoller(5 * time.Minute)

	// 创建HTTP处理器
	h := handler.NewHandler(manager)

	// 设置路由
	router := h.SetupRoutes()

	// 启动服务器
	serverAddr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Printf("🚀 WhatsApp Aggregator Service starting on %s", serverAddr)
	log.Printf("🛠️  Worker Mode: %s", cfg.Worker.Mode)
	log.Printf("🌐 Dashboard: http://%s/dashboard", serverAddr)

	// 优雅关闭
	go func() {
		if err := router.Run(serverAddr); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Shutting down server...")
	log.Println("✅ Server shutdown complete")
}
