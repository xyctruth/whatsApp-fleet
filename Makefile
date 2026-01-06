# Makefile for WhatsApp Multi-Service

# Variables
APP_NAME := whatsapp-master
WORKER_IMAGE := whatsapp-worker-v2:latest
MASTER_IMAGE := whatsapp-master:latest
MASTER_DIR := whatsapp-master
WORKER_DIR := whatsapp-worker-v2
UI_DIR := whatsapp-master-ui

# Colors
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
RESET  := $(shell tput -Txterm sgr0)

.PHONY: all help swagger build-worker-base build-worker build-master run-master-local run-master-docker run-ui-local clean

all: help

help:
	@echo ''
	@echo 'Usage:'
	@echo '  ${YELLOW}make${RESET} ${GREEN}<target>${RESET}'
	@echo ''
	@echo 'Targets:'
	@echo '  ${GREEN}swagger${RESET}             Generate Swagger API documentation'
	@echo '  ${GREEN}build-worker-base${RESET}   Build Worker Base Docker image (whatsapp-base:v1)'
	@echo '  ${GREEN}build-worker${RESET}        Build Worker Docker image'
	@echo '  ${GREEN}build-master${RESET}        Build Master Docker image'
	@echo '  ${GREEN}run-master-local${RESET}    Run Master service locally (with Docker worker mode)'
	@echo '  ${GREEN}run-master-docker${RESET}   Run Master service in Docker container'
	@echo '  ${GREEN}run-ui-local${RESET}        Run Master UI locally'
	@echo '  ${GREEN}clean${RESET}               Clean build artifacts'
	@echo ''

# Swagger
swagger:
	@echo '${YELLOW}Generating Swagger documentation...${RESET}'
	cd $(MASTER_DIR) && swag init -g cmd/server/main.go -o docs
	@echo '${GREEN}Swagger documentation generated in $(MASTER_DIR)/docs${RESET}'

# Build
build-worker-base:
	@echo '${YELLOW}Building Worker Base Docker image...${RESET}'
	docker build -t whatsapp-base:v1 -f ./$(WORKER_DIR)/Dockerfile.base ./$(WORKER_DIR)
	@echo '${GREEN}Worker base image built: whatsapp-base:v1${RESET}'

build-worker: build-worker-base
	@echo '${YELLOW}Building Worker Docker image...${RESET}'
	docker build -t $(WORKER_IMAGE) ./$(WORKER_DIR)
	@echo '${GREEN}Worker image built: $(WORKER_IMAGE)${RESET}'

build-master: swagger
	@echo '${YELLOW}Building Master Docker image...${RESET}'
	docker build -t $(MASTER_IMAGE) ./$(MASTER_DIR)
	@echo '${GREEN}Master image built: $(MASTER_IMAGE)${RESET}'

# Run
run-master-local:
	@echo '${YELLOW}Running Master service locally...${RESET}'
	@echo 'Ensure Docker is running and you have built the worker image.'
	export WORKER_MODE=docker && \
	export WHATSAPP_IMAGE=$(WORKER_IMAGE) && \
	cd $(MASTER_DIR) && \
	go run ./cmd/server/main.go

run-master-docker: build-master
	@echo '${YELLOW}Running Master service in Docker...${RESET}'
	# 简单的运行方式，如果需要挂载 docker socket 需要额外参数
	# 注意：在 Docker 中运行 Master 并管理兄弟容器需要挂载 /var/run/docker.sock
	docker run -d \
		--name $(APP_NAME) \
		-p 8080:8080 \
		-v /var/run/docker.sock:/var/run/docker.sock \
		-e WORKER_MODE=docker \
		-e WHATSAPP_IMAGE=$(WORKER_IMAGE) \
		$(MASTER_IMAGE)
	@echo '${GREEN}Master service running on port 8080${RESET}'

run-ui-local:
	@echo '${YELLOW}Running Master UI locally...${RESET}'
	cd $(UI_DIR) && npm install && npm run dev

# Update
update-workers: build-worker
	@echo '${YELLOW}Triggering Master to restart workers...${RESET}'
	curl -X POST http://localhost:8080/api/v1/system/restart-workers
	@echo '${GREEN}Restart triggered. Workers are updating in background.${RESET}'

restart-worker:
	@if [ -z "$(ACCOUNT_ID)" ]; then \
		echo '${YELLOW}Error: ACCOUNT_ID is required. Usage: make restart-worker ACCOUNT_ID=xxxx${RESET}'; \
		exit 1; \
	fi
	@echo '${YELLOW}Restarting worker $(ACCOUNT_ID)...${RESET}'
	curl -X POST http://localhost:8080/api/v1/accounts/$(ACCOUNT_ID)/restart
	@echo '\n${GREEN}Restart triggered.${RESET}'

logs-worker:
	@if [ -z "$(ACCOUNT_ID)" ]; then \
		echo '${YELLOW}Error: ACCOUNT_ID is required. Usage: make logs-worker ACCOUNT_ID=xxxx${RESET}'; \
		exit 1; \
	fi
	docker logs whatsapp-worker-$(ACCOUNT_ID)

# Clean
clean:
	@echo '${YELLOW}Cleaning up...${RESET}'
	rm -rf $(MASTER_DIR)/docs
	-docker rm -f $(APP_NAME)
	@echo '${GREEN}Cleanup complete${RESET}'
