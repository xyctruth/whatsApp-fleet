# WhatsApp Fleet

WhatsApp Fleet is a scalable multi-instance management platform for WhatsApp, built on [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js). It uses a Master–Worker architecture to centrally manage account lifecycle, upgrades, monitoring, and logs. The Master orchestrates and synchronizes status; Workers run containerized WhatsApp session services. A Web UI is provided for visual operations.

## ✨ Key Features

- 🚀 Unified orchestration: start, restart, and update all Worker instances centrally
- 📦 Multi-instance control: one Master manages multiple account containers
- 🔄 Automatic status sync: Master polls Worker status every 5 minutes
- 🐳 Containerized Workers: image-based deployment for scaling and versioning
- 📊 Observability: logs, health checks, and monitoring endpoints
- 🌐 Web UI: intuitive interface for account management and real-time monitoring

## 🏗️ Architecture

Components:
- Master (Go): account registry, Worker scheduling, status polling
- Worker (Node.js): whatsapp-web.js-based session service (v2)
- UI (Frontend): management and monitoring interface
- Repository layout: `whatsapp-master`, `whatsapp-worker-v2`, `whatsapp-master-ui`, `Makefile`

## 🐳 Worker Containerization

### Images
- Base image: `whatsapp-base:v1` — includes Chromium and system dependencies  
  - Dockerfile: [`whatsapp-worker-v2/Dockerfile.base`](whatsapp-worker-v2/Dockerfile.base)
- Worker image: `whatsapp-worker-v2:latest` — application layer  
  - Dockerfile: [`whatsapp-worker-v2/Dockerfile`](whatsapp-worker-v2/Dockerfile)

### Container runtime configuration
Workers must run in containers; parameters are provisioned by the Master:

| Item | Format | Description |
|------|--------|-------------|
| Container name | `whatsapp-worker-<ACCOUNT_ID>` | Unique identifier |
| Env vars | `PORT=<internal>`<br>`ACCOUNT_ID=<account id>` | Runtime configuration |
| Ports | `<external>:<internal>` | External ports assigned by Master |
| Network | `--network <configured network>` | Same network as Master |
| Session persistence | `-v <host>/whatsapp-session/<ACCOUNT_ID>:/app/whatsapp-session/<ACCOUNT_ID>` | Persistent data |

## 🔧 Worker Capabilities

### 🔐 Login & Session
- QR login, phone pairing login
- Automatic session restore
- APIs: `/api/login/status`, `/api/status`

### 💬 Messaging
- Send text messages: `/api/send-message`
- Fetch message history: `/api/messages`, `/api/messages/recent`
- Real-time message stream: `/api/messages/stream` (SSE)

### 👥 Contacts
- List contacts: `/api/contacts`
- Add/lookup contact: `/api/contacts/add`

### 👨‍👩‍👧‍👦 Groups
- Create group: `/api/groups/create`
- Add participants: `/api/groups/participants/add`

### 🌐 Proxy & Network
- External IP: `/api/proxy/external-ip`
- Network detection: `/api/proxy/detect`
- Switch proxy: `/api/proxy/switch`
- Proxy status: `/api/proxy/status`

### ⚙️ Runtime Control
- Logout: `/api/logout`
- Stop service: `/api/close`

References:
- Entry routes: [`server.js`](whatsapp-worker-v2/server.js)
- Business logic: [`WhatsAppService.js`](whatsapp-worker-v2/src/WhatsAppService.js)

## 🚀 Quick Start

### Prerequisites
- Docker
- Go 1.19+
- Node.js 16+

### Steps

#### 1️⃣ Build Worker base image
```bash
make build-worker-base
```

#### 2️⃣ Build Worker image
```bash
make build-worker
```

#### 3️⃣ Start Master service
```bash
make run-master-local
```

#### 4️⃣ Start Web UI
```bash
make run-ui-local
```

### 🌐 Addresses
| Service | URL | Description |
|--------|-----|-------------|
| Web UI | http://localhost:3001/ | Management interface |
| Master API | http://localhost:8080/api/v1/ | REST API |
| Swagger | http://localhost:8080/swagger/index.html | API docs |

## ⚙️ Configuration

### Master environment variables
| Name | Default | Description |
|------|---------|-------------|
| `WORKER_MODE` | `docker` | Enforce container mode |
| `WHATSAPP_IMAGE` | `whatsapp-worker-v2:latest` | Worker image name |

> Tip: Example values are set in run commands; usually no extra config is needed.

## 📚 Master API Reference

Base path: `/api/v1`

### 🏥 System & Config
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | System health |
| GET | `/stats` | System statistics |
| GET | `/config` | Get current config |
| PUT | `/config` | Update in-memory config |
| POST | `/system/restart-workers` | Restart/launch all Workers |

### 👤 Accounts
| Method | Path | Description |
|--------|------|-------------|
| POST | `/accounts` | Create account and start Worker |
| GET | `/accounts` | List all accounts |
| GET | `/accounts/:id` | Get account details |
| DELETE | `/accounts/:id` | Delete account |

### 🔐 Login
| Method | Path | Description |
|--------|------|-------------|
| POST | `/phone-login` | Start phone login flow |
| GET | `/accounts/:id/login/status` | Query login status |
| POST | `/accounts/:id/login/refresh` | Refresh login status |
| POST | `/accounts/:id/logout` | Logout account |
| POST | `/accounts/:id/close` | Stop service (free resources) |
| POST | `/accounts/:id/stop` | Stop account instance |
| POST | `/accounts/:id/restart` | Restart the account’s Worker |

### 💬 Messages & Contacts
| Method | Path | Description |
|--------|------|-------------|
| POST | `/send-message` | Send a message via account |
| GET | `/accounts/:id/messages` | Get recent messages |
| GET | `/accounts/:id/contacts` | List contacts |
| POST | `/accounts/:id/contacts` | Add contact |

### 👨‍👩‍👧‍👦 Groups
| Method | Path | Description |
|--------|------|-------------|
| POST | `/accounts/:id/groups` | Create group |
| POST | `/accounts/:id/groups/participants` | Add participants |

### 🌐 Proxy & Network
| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts/:id/proxy/status` | Proxy status |
| POST | `/accounts/:id/proxy/switch` | Switch proxy |
| GET | `/accounts/:id/proxy/external-ip` | External IP |
| GET | `/accounts/:id/proxy/detect` | Detect network/proxy |

### 🐛 Debug
| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts/:id/debug` | Debug info |
| GET | `/accounts/:id/debug/html` | Page HTML snapshot |
| GET | `/accounts/:id/debug/elements` | Page elements |
| POST | `/accounts/:id/debug/check-messages` | Manually check messages |

## ⚠️ Notes

- 📱 Respect WhatsApp’s Terms of Service and usage limitations.

## 🤝 Contributing

Issues and pull requests are welcome.

## 📄 License

This project is built on [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) and intended for learning and internal use. Please comply with the relevant open-source licenses and WhatsApp Terms of Service.

---

⭐ If this project helps you, consider giving it a Star!
