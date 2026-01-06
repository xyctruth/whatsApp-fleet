import axios from 'axios';

// 创建axios实例
const masterAPI = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

const workerAPI = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 30000,
});

// 请求拦截器
masterAPI.interceptors.request.use(
  (config) => {
    console.log(`🚀 Master API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Master API Request Error:', error);
    return Promise.reject(error);
  }
);

workerAPI.interceptors.request.use(
  (config) => {
    console.log(`🚀 Worker API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Worker API Request Error:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
masterAPI.interceptors.response.use(
  (response) => {
    console.log(`✅ Master API Response: ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.error(`❌ Master API Error: ${error.config?.url}`, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

workerAPI.interceptors.response.use(
  (response) => {
    console.log(`✅ Worker API Response: ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.error(`❌ Worker API Error: ${error.config?.url}`, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Master API 方法
export const masterService = {
  // 健康检查
  getHealth: () => masterAPI.get('/health'),
  
  // 账号管理
  getAccounts: () => masterAPI.get('/accounts'),
  createAccount: (data) => masterAPI.post('/accounts', data),
  getAccount: (id) => masterAPI.get(`/accounts/${id}`),
  updateAccount: (id, data) => masterAPI.put(`/accounts/${id}`, data),
  deleteAccount: (id) => masterAPI.delete(`/accounts/${id}`),
  
  // 手机号登录
  phoneLogin: (data) => masterAPI.post('/phone-login', data),
  
  // 系统统计
  getStats: () => masterAPI.get('/stats'),
  
  // 配置管理
  getConfig: () => masterAPI.get('/config'),
  updateConfig: (data) => masterAPI.put('/config', data),
};

// Worker API 方法 - 现在通过Master代理
export const workerService = {
  // 登录相关
  // login 已被 masterService.phoneLogin 替代，但保留用于特定场景（如果需要）
  login: (accountId, data) => masterAPI.post('/phone-login', data), 
  logout: (accountId) => masterAPI.post(`/accounts/${accountId}/logout`),
  close: (accountId) => masterAPI.post(`/accounts/${accountId}/close`),
  stop: (accountId) => masterAPI.post(`/accounts/${accountId}/stop`),
  restart: (accountId) => masterAPI.post(`/accounts/${accountId}/restart`),
  getLoginStatus: (accountId, config) => masterAPI.get(`/accounts/${accountId}/login/status`, config), // 确保使用 Master API
  getQRCode: (accountId) => masterAPI.get(`/accounts/${accountId}/qr-code`),
  
  // 代理相关
  getProxyStatus: (accountId) => masterAPI.get(`/accounts/${accountId}/proxy/status`),
  switchProxy: (accountId, data) => masterAPI.post(`/accounts/${accountId}/proxy/switch`, data),
  detectProxy: (accountId) => masterAPI.get(`/accounts/${accountId}/proxy/detect`),
  getExternalIP: (accountId) => masterAPI.get(`/accounts/${accountId}/proxy/external-ip`),
  
  // 联系人管理
  getContacts: (accountId) => masterAPI.get(`/accounts/${accountId}/contacts`),
  // 修正：addContact 应该传递 firstName 和 lastName
  addContact: (accountId, phone, firstName, lastName) => masterAPI.post(`/accounts/${accountId}/contacts`, { phone, firstName, lastName }),
  
  // 消息相关
  sendMessage: (data) => masterAPI.post('/send-message', data), // 注意：SendMessage在Handler中是根路径，因为它包含account_id
  getMessages: (accountId) => masterAPI.get(`/accounts/${accountId}/messages`),
  
  // 群组管理
  createGroup: (accountId, data) => masterAPI.post(`/accounts/${accountId}/groups`, data),
  addGroupParticipants: (accountId, data) => masterAPI.post(`/accounts/${accountId}/groups/participants`, data),

  // 调试相关
  getDebugHtml: (accountId) => masterAPI.get(`/accounts/${accountId}/debug/html`),
  getDebugElements: (accountId) => masterAPI.get(`/accounts/${accountId}/debug/elements`),
  checkMessages: (accountId) => masterAPI.post(`/accounts/${accountId}/debug/check-messages`),
  
};

// 通用错误处理
export const handleApiError = (error) => {
  if (error.response) {
    // 服务器响应错误
    const { status, data } = error.response;
    return {
      type: 'response',
      status,
      message: data?.message || `HTTP ${status} Error`,
      data: data
    };
  } else if (error.request) {
    // 网络错误
    return {
      type: 'network',
      message: '网络连接失败，请检查网络或服务器状态',
      error: error.message
    };
  } else {
    // 其他错误
    return {
      type: 'unknown',
      message: error.message || '未知错误',
      error
    };
  }
};

// 工具函数
export const formatApiResponse = (response) => {
  return {
    success: true,
    data: response.data,
    status: response.status,
    timestamp: new Date().toISOString()
  };
};

export const formatApiError = (error) => {
  const errorInfo = handleApiError(error);
  return {
    success: false,
    error: errorInfo,
    timestamp: new Date().toISOString()
  };
};
