.PHONY: build run test clean docker-build docker-run k8s-deploy k8s-delete

# Go相关变量
BINARY_NAME=whatsapp-aggregator
MAIN_PATH=./cmd/server
BUILD_DIR=./build

# Docker相关变量
DOCKER_IMAGE=whatsapp-aggregator:latest
DOCKER_COMPOSE_FILE=./deployments/docker/docker-compose.yml

# K8s相关变量
K8S_NAMESPACE=whatsapp
K8S_MANIFESTS=./deployments/k8s

# 构建应用
build:
	@echo "🔨 构建应用..."
	@mkdir -p $(BUILD_DIR)
	@CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "✅ 构建完成: $(BUILD_DIR)/$(BINARY_NAME)"

# 运行应用
run:
	@echo "🚀 启动应用..."
	@go run $(MAIN_PATH)

# 运行测试
test:
	@echo "🧪 运行测试..."
	@go test -v ./...

# 清理构建文件
clean:
	@echo "🧹 清理构建文件..."
	@rm -rf $(BUILD_DIR)
	@go clean

# 安装依赖
deps:
	@echo "📦 安装依赖..."
	@go mod tidy
	@go mod download

# 构建Docker镜像
docker-build:
	@echo "🐳 构建Docker镜像..."
	@docker build -t $(DOCKER_IMAGE) .
	@echo "✅ Docker镜像构建完成: $(DOCKER_IMAGE)"

# 使用Docker Compose运行
docker-run:
	@echo "🐳 使用Docker Compose启动服务..."
	@cd deployments/docker && docker-compose up -d
	@echo "✅ 服务已启动，访问: http://localhost:8080"

# 停止Docker Compose服务
docker-stop:
	@echo "🛑 停止Docker Compose服务..."
	@cd deployments/docker && docker-compose down
	@echo "✅ 服务已停止"

# 查看Docker Compose日志
docker-logs:
	@cd deployments/docker && docker-compose logs -f

# 构建WhatsApp Node服务镜像
build-node-service:
	@echo "🔨 构建WhatsApp Node服务镜像..."
	@cd ../whatsapp-node-service && docker build -t whatsapp-node-service:latest .
	@echo "✅ WhatsApp Node服务镜像构建完成"

# 完整Docker部署
docker-deploy: build-node-service docker-build docker-run

# K8s部署
k8s-deploy:
	@echo "☸️ 部署到Kubernetes..."
	@kubectl apply -f $(K8S_MANIFESTS)/namespace.yaml
	@kubectl apply -f $(K8S_MANIFESTS)/aggregator-deployment.yaml
	@echo "✅ K8s部署完成"
	@echo "📋 查看状态: kubectl get pods -n $(K8S_NAMESPACE)"

# K8s删除
k8s-delete:
	@echo "🗑️ 从Kubernetes删除..."
	@kubectl delete -f $(K8S_MANIFESTS)/aggregator-deployment.yaml --ignore-not-found=true
	@kubectl delete -f $(K8S_MANIFESTS)/namespace.yaml --ignore-not-found=true
	@echo "✅ K8s资源已删除"

# K8s状态查看
k8s-status:
	@echo "📋 查看K8s状态..."
	@kubectl get all -n $(K8S_NAMESPACE)

# K8s日志查看
k8s-logs:
	@echo "📝 查看K8s日志..."
	@kubectl logs -f deployment/whatsapp-aggregator -n $(K8S_NAMESPACE)

# 开发环境设置
dev-setup:
	@echo "🛠️ 设置开发环境..."
	@go mod tidy
	@go install github.com/air-verse/air@latest
	@echo "✅ 开发环境设置完成"
	@echo "💡 使用 'air' 命令启动热重载开发服务器"

# 热重载开发
dev:
	@echo "🔥 启动热重载开发服务器..."
	@air

# 格式化代码
fmt:
	@echo "🎨 格式化代码..."
	@go fmt ./...

# 代码检查
lint:
	@echo "🔍 代码检查..."
	@golangci-lint run

# 生成API文档
docs:
	@echo "📚 生成API文档..."
	@swag init -g $(MAIN_PATH)/main.go

# 显示帮助信息
help:
	@echo "WhatsApp Multi-Service Aggregator"
	@echo ""
	@echo "可用命令:"
	@echo "  build              构建应用"
	@echo "  run                运行应用"
	@echo "  test               运行测试"
	@echo "  clean              清理构建文件"
	@echo "  deps               安装依赖"
	@echo ""
	@echo "Docker命令:"
	@echo "  docker-build       构建Docker镜像"
	@echo "  docker-run         使用Docker Compose运行"
	@echo "  docker-stop        停止Docker Compose服务"
	@echo "  docker-logs        查看Docker日志"
	@echo "  docker-deploy      完整Docker部署"
	@echo ""
	@echo "K8s命令:"
	@echo "  k8s-deploy         部署到Kubernetes"
	@echo "  k8s-delete         从Kubernetes删除"
	@echo "  k8s-status         查看K8s状态"
	@echo "  k8s-logs           查看K8s日志"
	@echo ""
	@echo "开发命令:"
	@echo "  dev-setup          设置开发环境"
	@echo "  dev                启动热重载开发服务器"
	@echo "  fmt                格式化代码"
	@echo "  lint               代码检查"
	@echo "  docs               生成API文档"
