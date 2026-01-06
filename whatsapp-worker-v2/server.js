const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const WhatsAppService = require('./src/WhatsAppService');

const app = express();
const port = process.env.PORT || 4000;
const accountID = process.env.ACCOUNT_ID || "default";
const sessionDir = path.join(__dirname, "whatsapp-session", accountID);

const service = new WhatsAppService(sessionDir, accountID);

// Proactive cleanup on server start
service.killZombieBrowser().catch(e => console.error("Startup cleanup failed:", e));

// 自动尝试初始化 (如果存在session)
// 延迟一点启动，确保HTTP服务先就绪
setTimeout(() => {
    console.log("Checking for existing session to auto-start...");
    // 尝试用 phone 模式启动 (传入 accountID 作为手机号)
    // 如果有 session 它会自动恢复；如果没有，会请求配对码
    // 注意：这里没有代理配置，如果依赖代理才能上网，可能会失败。
    service.startLogin("phone", accountID)
        .then(status => {
            console.log("Auto-start initiation complete. Status:", status.status);
        })
        .catch(err => {
            console.error("Auto-start failed:", err.message);
        });
}, 3000);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', async (req, res) => {
    try {
        const { login_method, phone, login_phone, signin_type, socks5, is_cache_login, disable_qr_fallback, downgrade_timeout_ms } = req.body;
        let method = login_method || (signin_type === 40 ? "phone" : "qr");
        let phoneNumber = (phone || login_phone || "").trim();
        if (method === 'phone' && phoneNumber) {
            phoneNumber = phoneNumber.replace(/\D/g, '');
        }
        
        if (method === 'phone' && !phoneNumber) {
            return res.status(400).json({ success: false, error: "Missing phone number for phone login" });
        }
        
        let proxyConfig = null;
        if (socks5) {
             let socksObj = socks5;
             if (typeof socks5 === 'string') {
                 try {
                     socksObj = JSON.parse(socks5);
                 } catch(e) {}
             }
             
             if (typeof socksObj === 'object' && socksObj && socksObj.ip && socksObj.port) {
                 proxyConfig = {
                     ip: socksObj.ip,
                     port: socksObj.port,
                     user: socksObj.user || socksObj.username,
                     pwd: socksObj.pwd || socksObj.password
                 };
             }
        }

        console.log(`Login request: Account=${accountID}, Method=${method}, Phone=${phoneNumber}`);
        
        // Check if initialization is already in progress
        if (!service.isLoggedIn && ['initializing','waiting_for_code','waiting_for_scan'].includes(service.status)) {
            // Only return early if the method matches!
            // If current init is 'qr' and request is 'phone', we should proceed to startLogin which handles restart.
            // Use service.initMethod if available, or infer from state
            const currentMethod = service.initMethod || (service.pairingCode ? 'phone' : (service.qrCode ? 'qr' : 'qr')); // default to qr if initMethod not set (legacy)
            
            if (currentMethod === method) {
                console.log(`Login request matched existing initialization (${method}). Returning current status.`);
                const status = await service.getStatusResponse();
                return res.json({ success: true, ...status });
            } else {
                console.log(`Login request method (${method}) differs from current initialization (${currentMethod}). Restarting login...`);
            }
        }
        
        const effectiveDisableFallback = disable_qr_fallback !== undefined ? !!disable_qr_fallback : (method === 'phone');
        
        // 使用 Promise.race 设置登录超时，避免长时间挂起
        const loginPromise = service.startLogin(method, phoneNumber, "+86", proxyConfig, {
            disable_qr_fallback: effectiveDisableFallback,
            downgrade_timeout_ms: Number(downgrade_timeout_ms) || undefined
        });

        // 10分钟超时，如果登录过程（如等待 puppeteer 启动）太久，直接返回错误
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Login process timed out")), 600000)
        );

        const result = await Promise.race([loginPromise, timeoutPromise]);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error("Login failed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/login/status', async (req, res) => {
    try {
        const status = await service.getStatusResponse();
        res.json(status);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const status = await service.getStatusResponse();
        res.json({
            success: true,
            account_id: accountID,
            ...status
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/contacts', async (req, res) => {
    try {
        const contacts = await service.getContacts();
        res.json({ success: true, data: contacts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/contacts/add', async (req, res) => {
    try {
        const { phone, firstName, lastName } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, error: "Missing phone number" });
        }
        
        // 如果提供了 firstName，则执行添加操作
        if (firstName) {
            const result = await service.saveContact(phone, firstName, lastName);
            res.json({ success: true, data: result });
        } else {
            // 否则执行查询操作（兼容旧逻辑）
            const result = await service.getContactInfo(phone);
            res.json({ success: true, data: result });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/messages/recent', async (req, res) => {
    try {
        const list = await service.getRecentMessages();
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 兼容 master 的 /api/messages 路径，返回最近消息
app.get('/api/messages', async (req, res) => {
    try {
        const list = await service.getRecentMessages();
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/messages/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();
    res.write('data: {"success": true, "event": "ready"}\n\n');
    const handler = (msg) => {
        res.write(`data: ${JSON.stringify({ success: true, data: msg })}\n\n`);
    };
    service.events.on('message', handler);
    req.on('close', () => {
        service.events.off('message', handler);
        res.end();
    });
});

app.get('/api/qr-code', async (req, res) => {
    if (service.qrCode) {
        res.json({ success: true, qr_code: service.qrCode });
    } else {
        res.json({ success: false, message: "No QR code available" });
    }
});

app.post('/api/send-message', async (req, res) => {
    try {
        const { phone, contact, message } = req.body;
        const recipient = (phone || contact || '').trim();
        if (!recipient || !message) {
            return res.status(400).json({ success: false, error: "Missing recipient or message" });
        }
        const result = await service.sendMessage(recipient, message);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        await service.logout();
        res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/close', async (req, res) => {
    try {
        // Destroy client but keep session data (handled by destroy(false) which is default but we want to be explicit that we are just stopping the browser)
        await service.destroy();
        res.json({ success: true, message: "Service stopped (session preserved)" });
        // Optionally exit process if that's what "close" means in this context, 
        // but usually for a worker service managed by master, we might just want to stop the browser to save resources or restart.
        // If master expects the process to die, we should process.exit(0).
        // Given master spawns processes, let's keep it running but idle, or exit? 
        // Master's "CloseAccount" calls this. Master monitors process exit.
        // So if we just destroy browser, the node process is still running.
        // If master wants to kill the process, it can send SIGTERM.
        // But if user clicks "Close Worker" in UI -> Master calls /api/close.
        // Let's exit after response.
        setTimeout(() => process.exit(0), 1000);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/proxy/external-ip', async (req, res) => {
    const ip = await service.getExternalIp();
    res.json({ success: true, ip: ip });
});

app.get('/api/proxy/detect', async (req, res) => {
     const ip = await service.getExternalIp();
     res.json({ success: true, detected: ip !== "Error" && ip !== "Unknown" && !ip.startsWith("Error"), ip: ip });
});

// 切换代理 API
app.post('/api/proxy/switch', async (req, res) => {
    try {
        const proxyConfig = req.body;
        const ipStr = proxyConfig.ip || proxyConfig.host;
        const portStr = proxyConfig.port;
        console.log(`Switching proxy to: ${ipStr}:${portStr}`);
        
        if (!ipStr || !portStr) {
            return res.status(400).json({ success: false, error: "Invalid proxy config: missing host/ip or port" });
        }
        
        // 1. 强制销毁现有实例
        await service.destroy();
        await new Promise(r => setTimeout(r, 1200));
        
        // 2. 重新初始化（使用新的代理配置）
        // 注意：这里我们假设切换代理后，用户希望重新开始登录流程
        // 如果是已登录状态，通常切换代理会导致连接断开，需要重新登录
        
        // 我们尝试以 QR 模式重新启动，因为不知道之前的登录方式
        // 或者我们可以从之前的配置中恢复，但这里为了简单，我们重启服务
        
        // 获取当前账号ID（手机号）
        const accountId = service.accountId;
        
        // 重新启动服务
        // 这里的逻辑有点复杂，因为 startLogin 需要一些参数
        // 我们简化处理：只设置代理，然后让用户重新触发登录或重新连接
        
        // 但为了让切换立即生效，我们应该尝试重新启动客户端
        // 如果之前是已登录状态，whatsapp-web.js 可能会尝试恢复 session
        
        // 启动新的登录流程（不带特定手机号，默认QR，除非有session缓存）
        const result = await service.startLogin("qr", null, "+86", {
            ip: ipStr,
            port: portStr,
            user: proxyConfig.username || proxyConfig.user,
            pwd: proxyConfig.password || proxyConfig.pwd,
            scheme: proxyConfig.protocol || proxyConfig.scheme || 'socks5'
        });
        
        res.json({ success: true, message: "Proxy switched and service restarted", data: result });
    } catch (error) {
        console.error("Switch proxy failed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/proxy/status', (req, res) => {
    const status = service.getProxyStatus();
    res.json({ success: true, ...status });
});

app.post('/api/groups/create', async (req, res) => {
    try {
        const { name, participants } = req.body;
        if (!name || !participants || !Array.isArray(participants)) {
            return res.status(400).json({ success: false, error: "Invalid parameters" });
        }
        const result = await service.createGroup(name, participants);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/groups/participants/add', async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        if (!groupId || !participants || !Array.isArray(participants)) {
             return res.status(400).json({ success: false, error: "Invalid parameters" });
        }
        const result = await service.addParticipants(groupId, participants);
        res.json({ success: true, data: result });
    } catch (error) {
         res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Worker V2 listening on port ${port} for account ${accountID}`);
});
