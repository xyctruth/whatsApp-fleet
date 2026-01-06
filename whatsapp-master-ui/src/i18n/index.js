import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

const dictionaries = {
  zh: {
    'app.loading.title': '正在加载 WhatsApp Master UI...',
    'app.loading.subtitle': '请稍候，正在初始化系统',

    'header.title': 'WhatsApp 管理控制台',
    'header.refreshTitle': '刷新数据',
    'header.admin': '管理员',

    'sidebar.menu.dashboard': '仪表板',
    'sidebar.menu.workers': 'Worker管理',
    'sidebar.menu.whatsapp': 'WhatsApp控制',
    'sidebar.menu.messages': '消息管理',
    'sidebar.menu.settings': '系统设置',
    'sidebar.system.status': '系统状态',
    'sidebar.api.docs': 'API 文档',
    'sidebar.selectWorker': '选择Worker',

    'status.health.healthy': '正常',
    'status.health.degraded': '降级',
    'status.health.down': '停机',
    'status.health.unknown': '未知',

    'status.online': '在线',
    'status.running': '运行中',
    'status.offline': '离线',
    'status.error': '错误',
    'status.connecting': '连接中',

    'dashboard.title': '仪表板',
    'dashboard.subtitle': '系统概览和实时状态',
    'dashboard.refresh': '刷新数据',
    'dashboard.workerStatus': 'Worker状态',
    'dashboard.noWorkers': '暂无Worker实例',
    'dashboard.port': '端口',

    'common.refresh': '刷新',
    'common.start': '启动服务',
    'common.stop': '停止服务',
    'system.connectionFailed': '连接失败',

    'whatsapp.tabs.login': '登录管理',
    'whatsapp.tabs.proxy': '代理设置',
    'whatsapp.tabs.messages': '消息管理',
    'whatsapp.tabs.groups': '群组管理',
    'whatsapp.tabs.contacts': '联系人',
    'whatsapp.tabs.debug': '调试工具',

    'whatsapp.status.loggedIn': '已登录',
    'whatsapp.status.running': '运行中',
    'whatsapp.status.stopped': '已停止',
    'whatsapp.status.waitingQr': '等待扫码',
    'whatsapp.status.waitingPhone': '等待验证',
    'whatsapp.status.creating': '启动中',
    'whatsapp.status.unknown': '未知',
    'whatsapp.status.sub.whatsappOnline': 'WhatsApp 在线',
    'whatsapp.status.sub.waitingLogin': '等待登录',
    'whatsapp.status.sub.serviceClosed': '服务已关闭',
    'whatsapp.status.sub.scanQr': '请扫描二维码',
    'whatsapp.status.sub.enterCode': '请输入验证码',
    'whatsapp.status.sub.initializing': '正在初始化...',
    'whatsapp.status.sub.checkConnection': '检查连接',

    'whatsapp.toast.enterPhone': '请输入手机号',
    'whatsapp.toast.contactAdded': '联系人添加成功',
    'whatsapp.toast.contactAddFailed': '添加联系人失败',
    'whatsapp.toast.contactAddRequestFailed': '添加联系人请求失败',
    'whatsapp.confirm.stopService': '确定要停止服务吗？停止后将无法接收消息。',
    'whatsapp.toast.serviceStopped': '服务已停止',
    'whatsapp.toast.serviceStartSent': '服务启动指令已发送',
    'whatsapp.toast.serviceStartFailed': '启动服务失败',
    'whatsapp.toast.serviceStartRequestFailed': '启动服务失败',
    'whatsapp.toast.groupNameMembersRequired': '请填写群名称和成员',
    'whatsapp.toast.atLeastOneMember': '请至少指定一个成员',
    'whatsapp.toast.groupCreated': '群组创建成功',
    'whatsapp.toast.groupCreateFailed': '创建群组失败',
    'whatsapp.toast.groupCreateRequestFailed': '创建群组请求失败',
    'whatsapp.toast.groupIdMembersRequired': '请填写群ID和成员',
    'whatsapp.toast.membersAdded': '成员添加成功',
    'whatsapp.toast.addMembersFailed': '添加成员失败',
    'whatsapp.toast.addMembersRequestFailed': '添加成员请求失败',
    'whatsapp.toast.proxySwitchSuccess': '代理切换成功',
    'whatsapp.toast.proxySwitchFailed': '代理切换失败',
    'whatsapp.toast.proxySwitchRequestFailed': '代理切换请求失败',
    'whatsapp.toast.proxyDetectSuccess': '代理检测成功',
    'whatsapp.toast.proxyDetectFailed': '代理检测失败',
    'whatsapp.toast.proxyDetectRequestFailed': '代理检测请求失败',
    'whatsapp.toast.elementDetectSuccess': '元素检测成功',
    'whatsapp.toast.elementDetectFailed': '元素检测失败',
    'whatsapp.toast.elementDetectRequestFailed': '元素检测请求失败',
    'whatsapp.toast.debugHtmlFailed': '获取调试HTML失败',
    'whatsapp.toast.loginFlowStarted': '登录流程已启动，Worker已创建/启动',
    'whatsapp.toast.loginFailed': '登录失败',
    'whatsapp.toast.loginRequestFailedPrefix': '登录请求失败:',
    'whatsapp.toast.loginSuccess': '登录成功！',
    'whatsapp.toast.logoutSuccess': '退出登录成功',
    'whatsapp.toast.logoutFailed': '退出登录失败',
    'whatsapp.confirm.closeWorker': '确定要关闭这个Worker实例吗？这将停止服务。',
    'whatsapp.toast.workerClosed': 'Worker已关闭',
    'whatsapp.toast.closeWorkerFailed': '关闭Worker失败',
    'whatsapp.toast.loadContactsFailed': '加载联系人失败',
    'whatsapp.toast.loadMessagesFailed': '加载消息失败',
    'whatsapp.toast.fillAllFields': '请填写完整信息',
    'whatsapp.toast.messageSendSuccess': '消息发送成功',
    'whatsapp.toast.messageSendFailed': '消息发送失败',
    'whatsapp.toast.selectContactPrefix': '已选择联系人:',
  },
  en: {
    'app.loading.title': 'Loading WhatsApp Master UI...',
    'app.loading.subtitle': 'Please wait while the system initializes',

    'header.title': 'WhatsApp Admin Console',
    'header.refreshTitle': 'Refresh Data',
    'header.admin': 'Admin',

    'sidebar.menu.dashboard': 'Dashboard',
    'sidebar.menu.workers': 'Workers',
    'sidebar.menu.whatsapp': 'WhatsApp Control',
    'sidebar.menu.messages': 'Messages',
    'sidebar.menu.settings': 'Settings',
    'sidebar.system.status': 'System Status',
    'sidebar.api.docs': 'API Docs',
    'sidebar.selectWorker': 'Select Worker',

    'status.health.healthy': 'Healthy',
    'status.health.degraded': 'Degraded',
    'status.health.down': 'Down',
    'status.health.unknown': 'Unknown',

    'status.online': 'Online',
    'status.running': 'Running',
    'status.offline': 'Offline',
    'status.error': 'Error',
    'status.connecting': 'Connecting',

    'dashboard.title': 'Dashboard',
    'dashboard.subtitle': 'System overview and live status',
    'dashboard.refresh': 'Refresh Data',
    'dashboard.workerStatus': 'Worker Status',
    'dashboard.noWorkers': 'No Worker instances',
    'dashboard.port': 'Port',

    'common.refresh': 'Refresh',
    'common.start': 'Start Service',
    'common.stop': 'Stop Service',
    'system.connectionFailed': 'Connection failed',

    'whatsapp.tabs.login': 'Login',
    'whatsapp.tabs.proxy': 'Proxy',
    'whatsapp.tabs.messages': 'Messages',
    'whatsapp.tabs.groups': 'Groups',
    'whatsapp.tabs.contacts': 'Contacts',
    'whatsapp.tabs.debug': 'Debug Tools',

    'whatsapp.status.loggedIn': 'Logged In',
    'whatsapp.status.running': 'Running',
    'whatsapp.status.stopped': 'Stopped',
    'whatsapp.status.waitingQr': 'Waiting for QR',
    'whatsapp.status.waitingPhone': 'Waiting for verification',
    'whatsapp.status.creating': 'Starting',
    'whatsapp.status.unknown': 'Unknown',
    'whatsapp.status.sub.whatsappOnline': 'WhatsApp Online',
    'whatsapp.status.sub.waitingLogin': 'Waiting for login',
    'whatsapp.status.sub.serviceClosed': 'Service closed',
    'whatsapp.status.sub.scanQr': 'Please scan the QR code',
    'whatsapp.status.sub.enterCode': 'Please enter the code',
    'whatsapp.status.sub.initializing': 'Initializing...',
    'whatsapp.status.sub.checkConnection': 'Check connection',

    'whatsapp.toast.enterPhone': 'Please enter phone number',
    'whatsapp.toast.contactAdded': 'Contact added successfully',
    'whatsapp.toast.contactAddFailed': 'Failed to add contact',
    'whatsapp.toast.contactAddRequestFailed': 'Add contact request failed',
    'whatsapp.confirm.stopService': 'Stop service? You will not receive messages.',
    'whatsapp.toast.serviceStopped': 'Service stopped',
    'whatsapp.toast.serviceStartSent': 'Service start command sent',
    'whatsapp.toast.serviceStartFailed': 'Failed to start service',
    'whatsapp.toast.serviceStartRequestFailed': 'Failed to start service',
    'whatsapp.toast.groupNameMembersRequired': 'Enter group name and members',
    'whatsapp.toast.atLeastOneMember': 'Specify at least one member',
    'whatsapp.toast.groupCreated': 'Group created',
    'whatsapp.toast.groupCreateFailed': 'Failed to create group',
    'whatsapp.toast.groupCreateRequestFailed': 'Create group request failed',
    'whatsapp.toast.groupIdMembersRequired': 'Enter group ID and members',
    'whatsapp.toast.membersAdded': 'Members added',
    'whatsapp.toast.addMembersFailed': 'Failed to add members',
    'whatsapp.toast.addMembersRequestFailed': 'Add members request failed',
    'whatsapp.toast.proxySwitchSuccess': 'Proxy switched',
    'whatsapp.toast.proxySwitchFailed': 'Failed to switch proxy',
    'whatsapp.toast.proxySwitchRequestFailed': 'Proxy switch request failed',
    'whatsapp.toast.proxyDetectSuccess': 'Proxy detection succeeded',
    'whatsapp.toast.proxyDetectFailed': 'Proxy detection failed',
    'whatsapp.toast.proxyDetectRequestFailed': 'Proxy detection request failed',
    'whatsapp.toast.elementDetectSuccess': 'Element detection succeeded',
    'whatsapp.toast.elementDetectFailed': 'Element detection failed',
    'whatsapp.toast.elementDetectRequestFailed': 'Element detection request failed',
    'whatsapp.toast.debugHtmlFailed': 'Failed to get debug HTML',
    'whatsapp.toast.loginFlowStarted': 'Login flow started, Worker created/started',
    'whatsapp.toast.loginFailed': 'Login failed',
    'whatsapp.toast.loginRequestFailedPrefix': 'Login request failed:',
    'whatsapp.toast.loginSuccess': 'Login successful!',
    'whatsapp.toast.logoutSuccess': 'Logged out successfully',
    'whatsapp.toast.logoutFailed': 'Logout failed',
    'whatsapp.confirm.closeWorker': 'Close this Worker instance? This will stop service.',
    'whatsapp.toast.workerClosed': 'Worker closed',
    'whatsapp.toast.closeWorkerFailed': 'Failed to close Worker',
    'whatsapp.toast.loadContactsFailed': 'Failed to load contacts',
    'whatsapp.toast.loadMessagesFailed': 'Failed to load messages',
    'whatsapp.toast.fillAllFields': 'Please fill all fields',
    'whatsapp.toast.messageSendSuccess': 'Message sent',
    'whatsapp.toast.messageSendFailed': 'Failed to send message',
    'whatsapp.toast.selectContactPrefix': 'Selected contact:',
  },
};

const I18nContext = createContext({
  lang: 'zh',
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'zh');

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const t = useMemo(() => {
    const dict = dictionaries[lang] || dictionaries.zh;
    return (key) => dict[key] || key;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext);
}
