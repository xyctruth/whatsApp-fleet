const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const ProxyChain = require('proxy-chain');
const EventEmitter = require('events');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class WhatsAppService {
    constructor(sessionDir, accountId) {
        this.sessionDir = sessionDir || './whatsapp-session';
        this.accountId = accountId || 'default';
        this.client = null;
        this.qrCode = null;
        this.pairingCode = null;
        this.isLoggedIn = false;
        this.status = 'idle';
        this.qrTimeout = null;
        this.proxyServer = null;
        this.localProxyUrl = null;
        this.events = new EventEmitter();
        this.recentMessages = [];
        this.lastError = null;
        this.eventLog = [];
        this.currentProxyConfig = null;
        this.initMethod = null; // Track initialization method (qr/phone)
        
        // Proactive cleanup of SingletonLock on startup
        try {
            const lockPath = path.join(this.sessionDir, `session-${this.accountId}`, 'SingletonLock');
            if (fs.existsSync(lockPath)) {
                console.log(`[Startup] Found existing SingletonLock at ${lockPath}. Deleting it...`);
                fs.unlinkSync(lockPath);
                console.log(`[Startup] SingletonLock deleted.`);
            }
        } catch (err) {
            console.error(`[Startup] Failed to delete SingletonLock: ${err.message}`);
        }

        if (!global.__wa_err_handlers__) {
            process.on('uncaughtException', (e) => {
                console.error('UncaughtException', e);
                this.status = 'init_failed';
                this.lastError = e?.stack || String(e);
                this.eventLog.push({ ts: Date.now(), level: 'error', msg: 'uncaughtException', detail: this.lastError });
            });
             process.on('unhandledRejection', (e) => {
                 console.error('UnhandledRejection', e);
                 this.status = 'init_failed';
                 this.lastError = e?.stack || String(e);
                 this.eventLog.push({ ts: Date.now(), level: 'error', msg: 'unhandledRejection', detail: this.lastError });
             });
             global.__wa_err_handlers__ = true;
         }
     }
 
    cleanupSession() {
        try {
            const sessionPath = path.join(this.sessionDir, `session-${this.accountId}`);
            if (!fs.existsSync(sessionPath)) return;

            const filesToDelete = [
                'SingletonLock',
                'SingletonCookie', 
                'SingletonSocket'
            ];

            // 递归查找并删除 SingletonLock
            const findAndDelete = (dir) => {
                if (!fs.existsSync(dir)) return;
                let items;
                try {
                    items = fs.readdirSync(dir);
                } catch (e) {
                    console.warn(`[Cleanup] Failed to read dir ${dir}: ${e.message}`);
                    return;
                }

                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    try {
                        const stat = fs.lstatSync(fullPath);
                        if (stat.isDirectory()) {
                            findAndDelete(fullPath);
                        } else if (filesToDelete.includes(item)) {
                            try {
                                fs.unlinkSync(fullPath);
                                console.log(`[Cleanup] Deleted ${fullPath}`);
                            } catch (e) {
                                console.warn(`[Cleanup] Failed to delete ${fullPath}: ${e.message}`);
                            }
                        }
                    } catch (e) {
                        // 忽略 stat 失败
                    }
                }
            };

            console.log(`[Cleanup] Scanning for lock files in ${sessionPath}...`);
            findAndDelete(sessionPath);
        } catch (err) {
            console.error(`[Cleanup] Error during session cleanup: ${err.message}`);
        }
    }

    saveProxyConfig(config) {
        try {
            const configPath = path.join(this.sessionDir, `session-${this.accountId}`, 'proxy_config.json');
            // Ensure directory exists
            fs.ensureDirSync(path.dirname(configPath));
            if (config) {
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                console.log(`[Proxy] Configuration saved to ${configPath}`);
            } else {
                // If config is null, maybe delete? For now, we keep it or overwrite with null?
                // User requirement: "use previous proxy". If we switch to no proxy, we should probably delete it.
                // But startLogin(null) implies "use existing or none".
                // We'll handle deletion only if explicitly requested or handled elsewhere.
                // For now, let's just not save null if we are loading default.
            }
        } catch (err) {
            console.error(`[Proxy] Failed to save config: ${err.message}`);
        }
    }

    loadProxyConfig() {
        try {
            const configPath = path.join(this.sessionDir, `session-${this.accountId}`, 'proxy_config.json');
            if (fs.existsSync(configPath)) {
                const data = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(data);
                console.log(`[Proxy] Loaded saved configuration from ${configPath}`);
                return config;
            }
        } catch (err) {
            console.error(`[Proxy] Failed to load config: ${err.message}`);
        }
        return null;
    }

    async startLogin(method = "qr", phoneNumber = null, countryCode = "+86", proxyConfig = null, options = {}) {
        // Logic to persist or load proxy config
        if (proxyConfig) {
            // New config provided, save it
            this.saveProxyConfig(proxyConfig);
            this.currentProxyConfig = proxyConfig;
        } else {
            // No config provided, try to load saved one
            const savedConfig = this.loadProxyConfig();
            if (savedConfig) {
                console.log("[Proxy] Using saved proxy configuration");
                this.currentProxyConfig = savedConfig;
                proxyConfig = savedConfig; // Update local var for use below
            } else {
                this.currentProxyConfig = null;
            }
        }
        
        // If client exists, check status
        if (this.client) {
             // If we are already logged in, return success
             if (this.isLoggedIn) {
                 return { status: "already_logged_in", message: "Already logged in", skipQR: true };
             }
             // If an initialization is already in progress, do NOT destroy.
             // Return the current status (including pairing code or QR if available)
             if (this.status === 'initializing' || this.status === 'waiting_for_code' || this.status === 'waiting_for_scan') {
                 // Check if method matches
                 const currentMethod = this.initMethod || (this.pairingCode ? 'phone' : (this.qrCode ? 'qr' : null));
                 if (currentMethod === method) {
                     return this.getStatusResponse();
                 }
                 // If method is different (e.g. was QR now phone), we must destroy and restart.
                 // But if we are switching from phone to qr (downgrade), destroy is needed.
             }
             // If not logged in, but we want to start a new login, we should probably destroy the old one
             // to ensure fresh start with potentially new proxy settings or method.
             await this.destroy();
             await new Promise(r => setTimeout(r, 2000)); // Increase wait time to ensure browser is closed
        }

        // Set init method
        this.initMethod = method;

        // Proactive cleanup before starting new client
        this.cleanupSession();

        const puppeteerOptions = {
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--proxy-bypass-list=<-loopback>'
            ]
        };
 
         if (proxyConfig && proxyConfig.ip && proxyConfig.port) {
             let scheme = proxyConfig.scheme || proxyConfig.protocol || 'socks5';
             // Normalize scheme for proxy-chain
             if (scheme === 'socks5') scheme = 'socks5'; 
             
             if (proxyConfig.user && proxyConfig.pwd) {
                 if (this.proxyServer && this.localProxyUrl) {
                     puppeteerOptions.args.push(`--proxy-server=${this.localProxyUrl}`);
                 } else {
                     try {
                         console.log(`[Proxy] Starting local forwarder for ${scheme}://${proxyConfig.ip}:${proxyConfig.port}`);
                         this.proxyServer = new ProxyChain.Server({
                             port: 0,
                             verbose: true, // Enable verbose logging to debug tunnel failures
                             prepareRequestFunction: () => {
                                 return {
                                     upstreamProxyUrl: `${scheme}://${proxyConfig.user}:${proxyConfig.pwd}@${proxyConfig.ip}:${proxyConfig.port}`
                                 };
                             },
                         });
                         await this.proxyServer.listen();
                         this.localProxyUrl = `http://127.0.0.1:${this.proxyServer.port}`;
                         puppeteerOptions.args.push(`--proxy-server=${this.localProxyUrl}`);
                         console.log(`[Proxy] Local forwarder listening on ${this.localProxyUrl}`);
                     } catch (err) {
                         console.error("Failed to start local proxy forwarder:", err);
                         throw new Error(`Failed to configure proxy: ${err.message}`);
                     }
                 }
             } else {
                 const proxyUrl = `${scheme}://${proxyConfig.ip}:${proxyConfig.port}`;
                 console.log(`[Proxy] Using direct proxy: ${proxyUrl}`);
                 puppeteerOptions.args.push(`--proxy-server=${proxyUrl}`);
             }
         }
 
        const clientOptions = {
            authStrategy: new LocalAuth({ dataPath: this.sessionDir, clientId: this.accountId }),
            puppeteer: puppeteerOptions,
            authTimeoutMs: 0 // Disable internal auth timeout, we handle it in startLogin
        };

        if (method === 'phone' && phoneNumber) {
            phoneNumber = String(phoneNumber).replace(/\D/g, '');
            clientOptions.pairWithPhoneNumber = {
                phoneNumber: phoneNumber,
                showNotification: true,
            };
        }

        // 添加错误处理，防止构造函数抛出异常
        try {
            this.client = new Client(clientOptions);
            this.setupEvents();
        } catch (err) {
            console.error("Failed to create Client instance:", err);
            this.status = 'init_failed';
            this.lastError = err?.message || String(err);
            return { status: "init_failed", error: this.lastError };
        }
         
         console.log(`Starting client for ${this.accountId}, method: ${method}`);
         this.eventLog.push({ ts: Date.now(), level: 'info', msg: 'start_client', detail: { method, accountId: this.accountId }});
         
         // Reset state
         this.qrCode = null;
         this.pairingCode = null;
         this.status = 'initializing';
         
         this.client.initialize().catch(async (err) => {
             console.error("Client initialize failed:", err);
             
             // Check if it is the "browser already running" error
             if (err && err.message && err.message.includes("browser is already running")) {
                 console.log("[DEBUG] Browser already running detected. Cleaning up and retrying...");
                 this.eventLog.push({ ts: Date.now(), level: 'warn', msg: 'browser_conflict_retry', detail: err.message });
                 
                 // Kill zombie processes first
                 await this.killZombieBrowser();

                 // Try to remove the SingletonLock file if it exists
                 try {
                     const lockPath = path.join(this.sessionDir, `session-${this.accountId}`, 'SingletonLock');
                     if (fs.existsSync(lockPath)) {
                         fs.unlinkSync(lockPath);
                         console.log("Removed SingletonLock file");
                     }
                 } catch (cleanupErr) {
                     console.error("Failed to cleanup lock file:", cleanupErr);
                 }

                 setTimeout(async () => {
                     // Try to destroy again, just in case
                     await this.destroy();
                     await new Promise(r => setTimeout(r, 2000));
                     
                     // Re-create client
                     try {
                        this.client = new Client(clientOptions);
                        this.setupEvents();
                        
                        this.client.initialize().catch(retryErr => {
                           console.error("Client initialize retry failed:", retryErr);
                           this.status = 'init_failed';
                           this.lastError = retryErr?.stack || retryErr?.message || String(retryErr);
                           this.eventLog.push({ ts: Date.now(), level: 'error', msg: 'initialize_retry_failed', detail: this.lastError });
                        });
                     } catch(e) {
                        this.status = 'init_failed';
                        this.lastError = e.message;
                     }
                 }, 2000);
                 return;
             }

             this.status = 'init_failed';
             this.lastError = err?.stack || err?.message || String(err);
             this.eventLog.push({ ts: Date.now(), level: 'error', msg: 'initialize_failed', detail: this.lastError });
         });
 
        return new Promise((resolve, reject) => {
           const start = Date.now();
           const timeout = setTimeout(() => {
               if (this.status === 'initializing') {
                    reject(new Error("Timeout waiting for client initialization"));
               } else {
                   resolve(this.getStatusResponse());
               }
           }, 600000); // Increased from 120s to 600s (10 minutes)

            const checkInterval = setInterval(() => {
               const elapsed = Date.now() - start;
                if (this.isLoggedIn) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve({ status: "already_logged_in", message: "Logged in successfully", skipQR: true });
                } else if (method === 'qr' && this.qrCode) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve({ status: "waiting_for_scan", qrCode: this.qrCode, message: "Scan QR code" });
                } else if (method === 'phone' && this.pairingCode) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve({ status: "waiting_for_code", pairingCode: this.pairingCode, message: "Enter pairing code" });
                } else if (this.status === 'init_failed') {
                    if (method === 'phone' && !options.disable_qr_fallback) {
                        clearInterval(checkInterval);
                        clearTimeout(timeout);
                        this.destroy(true).then(() => {
                            this.startLogin("qr", null, countryCode, proxyConfig, options).then(resolve).catch(reject);
                        }).catch(reject);
                    } else {
                        clearInterval(checkInterval);
                        clearTimeout(timeout);
                        reject(new Error("Initialization failed"));
                    }
                } else if (method === 'phone' && !this.pairingCode && this.status === 'initializing') {
                    const cutoff = typeof options.downgrade_timeout_ms === 'number' ? options.downgrade_timeout_ms : 300000; // Default increased to 300s (5 minutes)
                    if (!options.disable_qr_fallback && elapsed > cutoff) {
                        clearInterval(checkInterval);
                        clearTimeout(timeout);
                        this.destroy(true).then(() => {
                            this.startLogin("qr", null, countryCode, proxyConfig, options).then(resolve).catch(reject);
                        }).catch(reject);
                    }
                 }
            }, 500);
 
            // Handle explicit auth failure or ready during initialization
            // Note: 'ready' event is handled in setupEvents which sets isLoggedIn=true
        });
     }

    setupEvents() {
        this.client.on('qr', async (qr) => {
            console.log('QR Received');
            try {
                this.qrCode = await qrcode.toDataURL(qr);
            } catch (e) {
                this.qrCode = qr;
            }
            this.status = 'waiting_for_scan';
            this.eventLog.push({ ts: Date.now(), level: 'info', msg: 'qr_received' });
        });

        this.client.on('code', (code) => {
            console.log('Pairing Code Received:', code);
            this.pairingCode = code;
            this.status = 'waiting_for_code';
            this.eventLog.push({ ts: Date.now(), level: 'info', msg: 'pairing_code', detail: code });
        });

        this.client.on('ready', () => {
            console.log('Client is ready!');
            this.isLoggedIn = true;
            this.status = 'logged_in';
            this.qrCode = null;
            this.pairingCode = null;
            this.eventLog.push({ ts: Date.now(), level: 'info', msg: 'ready' });
        });

        this.client.on('authenticated', () => {
            console.log('Client is authenticated!');
            this.isLoggedIn = true;
            this.status = 'logged_in';
            this.eventLog.push({ ts: Date.now(), level: 'info', msg: 'authenticated' });
        });
        this.client.on('message', (msg) => {
            // Filter system messages
            // Common types: chat, image, video, audio, ptt, document, sticker, location, vcard
            // System types: e2e_notification, protocol, ciphertext, revoken, groups_v4_invite, etc.
            const allowedTypes = ['chat', 'image', 'video', 'audio', 'ptt', 'document', 'sticker', 'location', 'vcard'];
            if (!allowedTypes.includes(msg.type)) {
                return;
            }

            const data = {
                id: msg.id && msg.id._serialized ? msg.id._serialized : undefined,
                from: msg.from,
                to: msg.to,
                body: msg.body,
                timestamp: msg.timestamp * 1000, // Convert unix timestamp to milliseconds
                type: msg.type,
                isGroupMsg: msg.isGroupMsg,
                author: msg.author,
                notifyName: msg._data?.notifyName || msg.notifyName
            };
            this.recentMessages.push(data);
            if (this.recentMessages.length > 200) this.recentMessages.shift();
            this.events.emit('message', data);
        });
        
        this.client.on('auth_failure', (msg) => {
            console.error('Auth failure:', msg);
            this.isLoggedIn = false;
            this.status = 'auth_failure';
            this.lastError = typeof msg === 'string' ? msg : JSON.stringify(msg);
            this.eventLog.push({ ts: Date.now(), level: 'error', msg: 'auth_failure', detail: this.lastError });
        });
        
        this.client.on('disconnected', (reason) => {
            console.log('Client was disconnected', reason);
            this.isLoggedIn = false;
            this.status = 'disconnected';
            this.client = null;
            this.eventLog.push({ ts: Date.now(), level: 'warn', msg: 'disconnected', detail: reason });
        });
    }

    async getContacts() {
        if (!this.client || !this.isLoggedIn) return [];
        try {
            const contacts = await this.client.getContacts();
            
            // 去重逻辑：基于 id._serialized
            const uniqueContacts = new Map();
            contacts.forEach(c => {
                if (c.id && c.id._serialized) {
                    // 过滤逻辑：保留 "我的联系人" 或者 "群组" 或者 "已有名称的联系人"
                    // 修正：新添加的联系人可能 isMyContact=false，但如果它是有效的用户账号且有 number，我们应该显示出来
                    // 只要是个人账号(isUser)或群组(isGroup)都应该考虑，
                    // 排除掉没有号码的无效数据
                    const isValid = c.isUser || c.isGroup;
                    if (!isValid) return;

                    // 如果只显示 MyContact，刚添加的可能看不到。
                    // 策略：显示所有非 blocked 的联系人，或者有名字的联系人
                    
                    uniqueContacts.set(c.id._serialized, {
                        id: c.id._serialized,
                        name: c.name || c.pushname || c.number, // 优先使用 name (通讯录名字) -> pushname (对方设置的名字) -> 号码
                        number: c.number,
                        isGroup: c.isGroup,
                        isMyContact: c.isMyContact,
                        pushname: c.pushname, // 额外返回 pushname 方便前端展示
                        avatar: '' 
                    });
                }
            });
            
            return Array.from(uniqueContacts.values());
        } catch (err) {
             console.error("Get contacts failed:", err);
             this.handleCriticalError(err);
             return [];
        }
    }

    async addContact(phone) {
        // 重载支持: 如果只传了一个参数，且是对象，可能是遗留调用或错误
        // 但这里我们主要处理 (phone) 的情况，其实我们更想要 (phone, firstName)
        // 之前的实现是只查是否存在，并没有真正添加到通讯录。
        // 现在我们合并逻辑：如果只传 phone，则尝试查找并返回信息（不添加）
        // 如果传了 phone 和 name，则执行添加操作。
        
        // 为了兼容性，我们将此方法拆分。
        // getContactInfo(phone) -> 原来的 addContact 逻辑
        // saveContact(phone, first, last) -> 新的添加逻辑
        
        // 但由于 JS 没有方法重载，我们通过参数个数判断
        // 然而上面的 addContact 定义覆盖了下面的。
        // 修正：删除上面的 addContact 定义，统一在这里处理。
        throw new Error("Method signature mismatch. Please use getContactInfo or saveContact");
    }
    
    // 获取联系人信息（检查是否注册）
    async getContactInfo(phone) {
        if (!this.client || !this.isLoggedIn) throw new Error("Not logged in");
        try {
            const numberId = await this.client.getNumberId(phone);
            if (!numberId) {
                throw new Error("Number not registered on WhatsApp");
            }
            const contact = await this.client.getContactById(numberId._serialized);
            return {
                id: contact.id._serialized,
                name: contact.name || contact.pushname || contact.number,
                number: contact.number,
                isGroup: contact.isGroup,
                isMyContact: contact.isMyContact
            };
        } catch (err) {
            console.error("Get contact info failed:", err);
            this.handleCriticalError(err);
            throw err;
        }
    }

    // 保存联系人到通讯录
    async saveContact(phone, firstName, lastName = "") {
        if (!this.client || !this.isLoggedIn) throw new Error("Not logged in");
        
        // 清洗号码，移除所有非数字字符
        const cleanPhone = String(phone).replace(/\D/g, '');
        if (!cleanPhone) throw new Error("Invalid phone number");

        try {
            // 验证号码是否有效
            const numberId = await this.client.getNumberId(cleanPhone);
            if (!numberId) {
                throw new Error(`Phone number ${cleanPhone} is not registered on WhatsApp`);
            }
            const standardizedPhone = numberId.user;

            console.log(`[Contact] Adding contact: ${standardizedPhone}, Name: ${firstName} ${lastName}`);

            // saveOrEditAddressbookContact 是我们在 whatsapp-web.js 源码中确认存在的方法
            // 或者使用我们刚才在 Client.js 中添加的 addContact 别名
            if (this.client.addContact) {
                 await this.client.addContact(standardizedPhone, firstName);
            } else {
                 await this.client.saveOrEditAddressbookContact(standardizedPhone, firstName, lastName, true);
            }
            
            // 尝试重新获取联系人列表以确认添加成功（可选，因为可能有延迟）
            // const contacts = await this.client.getContacts();
            // const added = contacts.find(c => c.number === standardizedPhone);
            // if (!added || !added.isMyContact) {
            //    console.warn("[Contact] Contact added but not yet synced as 'MyContact'");
            // }

            return { success: true, phone: standardizedPhone };
        } catch (err) {
             console.error("Save contact failed:", err);
             // 如果是网络错误或关键错误，才调用 handleCriticalError
             if (err.message && (err.message.includes('detached') || err.message.includes('Session closed'))) {
                this.handleCriticalError(err);
             }
             throw err;
        }
    }

    handleCriticalError(err) {
        const errMsg = err?.message || String(err);
        
        // 如果当前已经是 idle 状态（正在销毁或未启动），忽略错误
        if (this.status === 'idle') return;

        // 定义关键错误关键字
        const criticalErrors = [
            'detached Frame', 
            'Session closed', 
            'Target closed', 
            'Protocol error',
            'ERR_CONNECTION_CLOSED', // 网络连接关闭
            'ERR_CONNECTION_RESET',
            'ERR_PROXY_CONNECTION_FAILED'
        ];

        if (criticalErrors.some(k => errMsg.includes(k))) {
            console.error(`[Critical] System error detected: ${errMsg}. Scheduling restart.`);
            
            // Schedule a restart (destroy and re-initialize)
            // We can't easily re-init here because we don't have the login params (proxy, etc)
            // But we can emit an event or just destroy to force status change
            // Ideally server.js should handle this.
            // For now, let's just destroy to prevent further hanging calls
            this.destroy().catch(e => console.error("Error during emergency destroy:", e));
            this.status = 'error';
            this.lastError = `Critical: ${errMsg}`;
        }
    }

    async createGroup(name, participants) {
        if (!this.client || !this.isLoggedIn) throw new Error("Not logged in");
        try {
            // Participants should be an array of contact IDs
            const result = await this.client.createGroup(name, participants);
            const groupId = (result && result.gid && result.gid._serialized) ? result.gid._serialized : (result && result.gid ? result.gid : null);
            if (groupId) {
                const chat = await this.client.getChatById(groupId);
                if (chat && chat.isGroup && typeof chat.setMessagesAdminsOnly === 'function') {
                    await chat.setMessagesAdminsOnly(false);
                }
                if (chat && chat.isGroup && typeof chat.setInfoAdminsOnly === 'function') {
                    await chat.setInfoAdminsOnly(false);
                }
                if (chat && chat.isGroup && typeof chat.setAddMembersAdminsOnly === 'function') {
                    await chat.setAddMembersAdminsOnly(false);
                }
            }
            return result;
        } catch (err) {
            console.error("Create group failed:", err);
            throw err;
        }
    }

    async addParticipants(groupId, participants) {
        if (!this.client || !this.isLoggedIn) throw new Error("Not logged in");
        try {
             const chat = await this.client.getChatById(groupId);
             if (!chat.isGroup) throw new Error("Target chat is not a group");
             const result = await chat.addParticipants(participants);
             return result;
        } catch (err) {
            console.error("Add participants failed:", err);
            throw err;
        }
    }


    async getExternalIp() {
        if (!this.client) return "Unknown (Client not ready)";
        
        // Use pupBrowser if available, otherwise try to get it from pupPage
        const browser = this.client.pupBrowser || (this.client.pupPage ? this.client.pupPage.browser() : null);
        
        if (!browser) return "Unknown (Browser not ready)";

        let page = null;
        try {
            // Open a new blank page to bypass WhatsApp Web CSP restrictions
            page = await browser.newPage();
            
            // Navigate to about:blank first to ensure clean state
            await page.goto('about:blank');

            return await page.evaluate(async () => {
                // ... inner evaluation code ...
                const getIp = async (url) => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);
                    try {
                        const response = await fetch(url, { signal: controller.signal });
                        clearTimeout(timeoutId);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const text = await response.text();
                        try {
                            const json = JSON.parse(text);
                            // Return detailed info if available
                            if (json.ip) {
                                return `IP: ${json.ip} (Country: ${json.country_code || json.country || 'Unknown'})`;
                            }
                            return json.origin || text;
                        } catch (e) {
                            return text.slice(0, 100); // Limit length
                        }
                    } catch (e) {
                        clearTimeout(timeoutId);
                        throw e;
                    }
                };

                const services = [
                    'https://ifconfig.co/json',      // Provides Country info
                    'https://ipapi.co/json/',        // Provides detailed info
                    'https://api.ipify.org?format=json' // Fallback
                ];

                let lastError = null;
                for (const service of services) {
                    try {
                        const info = await getIp(service);
                        if (info) return info;
                    } catch (e) {
                        lastError = e;
                    }
                }
                return "Error: " + (lastError ? lastError.toString() : "All IP services failed");
            });
        } catch(e) {
            // 如果错误是因为 Target closed 且客户端正在销毁，则忽略
            if (e.message && (e.message.includes('Target closed') || e.message.includes('Protocol error')) && this.status === 'idle') {
                return "Client destroying...";
            }
            console.error("Error getting external IP", e);
            return "Error: " + e.message;
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch(e) {}
            }
        }
    }

    getProxyStatus() {
        return {
            enabled: !!this.currentProxyConfig,
            config: this.currentProxyConfig ? {
                ...this.currentProxyConfig,
                pwd: '***' // Hide password
            } : null,
            local_forwarder: this.localProxyUrl
        };
    }

    async sendMessage(to, message) {
        if (!this.client || !this.isLoggedIn) throw new Error("Not logged in");
        let chatId = to;
        if (!chatId.includes('@')) {
            if (/^\d+$/.test(chatId)) {
                chatId = `${chatId}@c.us`;
            } else {
                const contacts = await this.client.getContacts();
                const contact = contacts.find(c =>
                    (c.name && c.name === chatId) ||
                    (c.pushname && c.pushname === chatId) ||
                    (c.number && c.number === chatId)
                );
                if (contact) {
                    chatId = contact.id._serialized;
                } else {
                    throw new Error(`Contact '${to}' not found. Please use a valid phone number or exact contact name.`);
                }
            }
        }
        try {
            return await this.client.sendMessage(chatId, message);
        } catch (err) {
            const errMsg = err.message || String(err);
            if (errMsg === 't' || !errMsg) {
                throw new Error("Failed to send message: Internal protocol error");
            }
            throw err;
        }
    }
    
    async getStatusResponse() {
         return {
            success: true,
            is_logged_in: this.isLoggedIn,
            status: this.status,
            qr_code: this.qrCode,
            pairing_code: this.pairingCode,
            last_error: this.lastError
         };
    }
    
    async getRecentMessages() {
        return this.recentMessages.slice(-100);
    }
    
    async getDebugInfo() {
        return {
            success: true,
            status: this.status,
            is_logged_in: this.isLoggedIn,
            pairing_code: this.pairingCode,
            has_qr: !!this.qrCode,
            proxy_forwarder: !!this.localProxyUrl,
            last_error: this.lastError,
            events: this.eventLog.slice(-50),
        };
    }

    async killZombieBrowser() {
        if (process.platform === 'win32') return;

        console.log(`[ZombieKiller] Checking for zombie Chrome processes for account ${this.accountId}...`);
        const uniqueSessionDir = `session-${this.accountId}`;
        
        try {
            const cmd = `ps -ef | grep "chrome" | grep "${uniqueSessionDir}" | grep -v grep | awk '{print $2}'`;
            const { stdout } = await execPromise(cmd);
            
            const pids = stdout.split('\n').map(p => p.trim()).filter(p => p);
            
            if (pids.length > 0) {
                console.log(`[ZombieKiller] Found zombie PIDs for ${this.accountId}: ${pids.join(', ')}. Killing...`);
                for (const pid of pids) {
                    try {
                        process.kill(pid, 'SIGKILL');
                        console.log(`[ZombieKiller] Killed PID ${pid}`);
                    } catch(e) {
                        console.log(`[ZombieKiller] Failed to kill PID ${pid} (maybe already gone)`);
                    }
                }
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.log(`[ZombieKiller] No zombie processes found for ${this.accountId}`);
            }
        } catch (err) {
            console.error(`[ZombieKiller] Error executing cleanup: ${err.message}`);
        }
    }

    async destroy(keepProxy = false) {
         if (this.client) {
             try {
                 await this.client.destroy();
             } catch(e) {
                 console.error("Error destroying client", e);
             }
             this.client = null;
         }
 
         if (this.proxyServer && !keepProxy) {
             try {
                 await this.proxyServer.close(true); // true = force close
                 console.log("Local proxy forwarder closed");
             } catch(e) {
                 console.error("Error closing proxy server", e);
             }
             this.proxyServer = null;
             this.localProxyUrl = null;
         }
 
         this.isLoggedIn = false;
         this.qrCode = null;
        this.pairingCode = null;
        this.status = 'idle';
        this.initMethod = null;
        
        // 清除状态后，强制清理可能残留的浏览器进程
        await this.killZombieBrowser();
     }

    async logout() {
        if (this.client && this.isLoggedIn) {
            await this.client.logout();
            this.isLoggedIn = false;
        }
    }
}

module.exports = WhatsAppService;
