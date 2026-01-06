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
