# WhatsApp Fleet

WhatsApp Fleet 是一个可扩展的 WhatsApp 多实例管控平台，基于 [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) 构建，采用 Master-Worker 架构统一管理多账号的运行、升级、监控与日志。Master 负责编排与状态同步，Worker 以容器化方式运行，负责实际的 WhatsApp 会话服务；同时提供 Web UI 以便可视化运维。

## ✨ 核心特性

- **🚀 统一编排**：集中启动、重启、更新所有 Worker 实例
- **📦 多实例管理**：一套 Master 管理多个账号实例（容器化部署）
- **🔄 自动状态同步**：Master 每 5 分钟轮询 Worker 状态，确保服务健康
- **🐳 容器化 Worker**：镜像化部署，便于扩容与版本升级
- **📊 可观测性**：提供日志查看、健康检查与监控接口
- **🌐 Web UI**：直观的管理界面，支持账号管理和实时监控

## 🏗️ 系统架构

**组件说明**：
- **Master (Go)**：账号清单管理、Worker 调度、状态轮询
- **Worker (Node.js)**：基于 whatsapp-web.js 的会话服务 (v2)
- **UI (Frontend)**：管理与监控界面
- **目录结构**：`whatsapp-master`、`whatsapp-worker-v2`、`whatsapp-master-ui`、`Makefile`

## 🐳 Worker 容器化

### 镜像构建
- **基础镜像**：`whatsapp-base:v1` - 包含 Chromium 及系统依赖
  - 📁 Dockerfile：[`whatsapp-worker-v2/Dockerfile.base`](whatsapp-worker-v2/Dockerfile.base)
- **Worker 镜像**：`whatsapp-worker-v2:latest` - 应用层镜像
  - 📁 Dockerfile：[`whatsapp-worker-v2/Dockerfile`](whatsapp-worker-v2/Dockerfile)

### 容器启动配置
Worker 必须以容器方式启动，启动参数由 Master 统一下发：

| 配置项 | 格式 | 说明 |
|--------|------|------|
| 容器名 | `whatsapp-worker-<ACCOUNT_ID>` | 唯一标识 |
| 环境变量 | `PORT=<内部端口>`<br>`ACCOUNT_ID=<账号ID>` | 运行时配置 |
| 端口映射 | `<外部端口>:<内部端口>` | 外部端口由 Master 分配 |
| 网络 | `--network <配置中的 Network>` | 与 Master 同网络 |
| 会话持久化 | `-v <宿主>/whatsapp-session/<ACCOUNT_ID>:/app/whatsapp-session/<ACCOUNT_ID>` | 数据持久化 |

## 🔧 Worker 功能模块

### 🔐 登录与会话
- 二维码登录、手机号配对登录
- 自动恢复会话状态
- API：`/api/login/status`、`/api/status`

### 💬 消息能力
- 发送文本消息：`/api/send-message`
- 获取消息历史：`/api/messages`、`/api/messages/recent`
- 实时消息流：`/api/messages/stream` (SSE)

### 👥 联系人管理
- 获取联系人列表：`/api/contacts`
- 新增/查询联系人：`/api/contacts/add`

### 👨‍👩‍👧‍👦 群组管理
- 创建群组：`/api/groups/create`
- 添加群成员：`/api/groups/participants/add`

### 🌐 代理与网络
- 外网 IP 查询：`/api/proxy/external-ip`
- 网络检测：`/api/proxy/detect`
- 代理切换：`/api/proxy/switch`
- 代理状态：`/api/proxy/status`

### ⚙️ 运行控制
- 账号登出：`/api/logout`
- 关闭服务：`/api/close`

**参考实现**：
- 🚪 路由入口：[`server.js`](whatsapp-worker-v2/server.js)
- 🏗️ 业务逻辑：[`WhatsAppService.js`](whatsapp-worker-v2/src/WhatsAppService.js)

## 🚀 快速开始

### 前置依赖
- Docker
- Go 1.19+
- Node.js 16+

### 部署步骤

#### 1️⃣ 构建 Worker 基础镜像
```bash
make build-worker-base
```

#### 2️⃣ 构建 Worker 镜像
```bash
make build-worker
```

#### 3️⃣ 启动 Master 服务
```bash
make run-master-local
```

#### 4️⃣ 启动 Web UI
```bash
make run-ui-local
```

### 🌐 访问地址
| 服务 | 地址 | 说明 |
|------|------|------|
| Web UI | http://localhost:3001/ | 管理界面 |
| Master API | http://localhost:8080/api/v1/ | REST API |
| API 文档 | http://localhost:8080/swagger/index.html | Swagger 文档 |

## ⚙️ 配置说明

### Master 环境变量
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `WORKER_MODE` | `docker` | 强制容器模式 |
| `WHATSAPP_IMAGE` | `whatsapp-worker-v2:latest` | Worker 镜像名 |

> 💡 示例配置已在运行命令中设置，一般无需额外配置

## 📚 Master API 参考

**基础路径**：`/api/v1`

### 🏥 系统与配置
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 获取系统健康状态 |
| GET | `/stats` | 获取系统统计信息 |
| GET | `/config` | 获取当前配置 |
| PUT | `/config` | 更新配置（内存） |
| POST | `/system/restart-workers` | 重启/拉起所有 Worker |

### 👤 账号管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/accounts` | 创建账号并启动 Worker |
| GET | `/accounts` | 列出所有账号 |
| GET | `/accounts/:id` | 获取账号详情 |
| DELETE | `/accounts/:id` | 删除账号 |

### 🔐 登录管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/phone-login` | 触发手机号登录流程 |
| GET | `/accounts/:id/login/status` | 查询登录状态 |
| POST | `/accounts/:id/login/refresh` | 刷新登录状态 |
| POST | `/accounts/:id/logout` | 登出账号 |
| POST | `/accounts/:id/close` | 关闭服务（释放资源） |
| POST | `/accounts/:id/stop` | 停止账号实例 |
| POST | `/accounts/:id/restart` | 重启指定账号的 Worker |

### 💬 消息与联系人
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/send-message` | 使用指定账号发送消息 |
| GET | `/accounts/:id/messages` | 获取最近消息 |
| GET | `/accounts/:id/contacts` | 获取联系人列表 |
| POST | `/accounts/:id/contacts` | 新增联系人 |

### 👨‍👩‍👧‍👦 群组管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/accounts/:id/groups` | 创建群组 |
| POST | `/accounts/:id/groups/participants` | 添加群成员 |

### 🌐 代理与网络
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/accounts/:id/proxy/status` | 查看代理状态 |
| POST | `/accounts/:id/proxy/switch` | 切换代理 |
| GET | `/accounts/:id/proxy/external-ip` | 获取外网 IP |
| GET | `/accounts/:id/proxy/detect` | 检测网络/代理可用性 |

### 🐛 调试接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/accounts/:id/debug` | 获取调试信息 |
| GET | `/accounts/:id/debug/html` | 获取页面 HTML 快照 |
| GET | `/accounts/:id/debug/elements` | 获取页面元素信息 |
| POST | `/accounts/:id/debug/check-messages` | 手动触发消息检查 |

## ⚠️ 注意事项

- 📱 WhatsApp 官方限制：请遵守 WhatsApp 的使用条款和限制

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 版权与许可

本项目基于 [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) 构建，仅用于学习与内部使用。请遵守相关开源许可证和 WhatsApp 使用条款。

---

⭐ 如果这个项目对您有帮助，请给个 Star 支持一下！
