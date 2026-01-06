import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Server, 
  MessageSquare, 
  Mail, 
  Settings,
  Circle,
  ChevronDown,
  FileText
} from 'lucide-react';

const Sidebar = ({ systemHealth, selectedWorker, workers, onWorkerSelect, onMenuClick }) => {
  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: '仪表板' },
    { path: '/workers', icon: Server, label: 'Worker管理' },
    { path: '/whatsapp', icon: MessageSquare, label: 'WhatsApp控制' },
    { path: '/messages', icon: Mail, label: '消息管理' },
    { path: '/settings', icon: Settings, label: '系统设置' },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-success';
      case 'degraded': return 'text-warning';
      case 'down': return 'text-error';
      default: return 'text-text-secondary';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'healthy': return '正常';
      case 'degraded': return '降级';
      case 'down': return '停机';
      default: return '未知';
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'logged_in':
      case 'online':
      case 'connected':
        return { label: '在线', className: 'status-online' };
      case 'running':
        return { label: '运行中', className: 'status-info' };
      case 'stopped':
      case 'offline':
      case 'logged_out':
        return { label: '离线', className: 'status-offline' };
      case 'error':
        return { label: '错误', className: 'status-error' };
      default:
        return { label: status || '连接中', className: 'status-warning' };
    }
  };

  return (
    <aside className="w-64 bg-surface shadow-xl border-r border-border flex flex-col transition-all duration-300">
      {/* Logo区域 */}
      <div className="p-6 border-b border-border bg-gradient-to-r from-surface to-bg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-xl shadow-lg flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-main tracking-tight">WhatsApp</h1>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Master UI</p>
          </div>
        </div>
      </div>

      {/* 系统状态 */}
      <div className="p-4 border-b border-border bg-surface/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">系统状态</span>
          <div className="flex items-center space-x-2 px-2 py-1 rounded-full bg-bg">
            <Circle className={`w-2.5 h-2.5 fill-current ${getStatusColor(systemHealth)}`} />
            <span className={`text-xs font-semibold ${getStatusColor(systemHealth)}`}>
              {getStatusText(systemHealth)}
            </span>
          </div>
        </div>
      </div>

      {/* Worker选择 */}
      {workers.length > 0 && (
        <div className="p-4 border-b border-border">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            当前Worker
          </label>
          <div className="relative group">
            <select
              value={selectedWorker?.id || ''}
              onChange={(e) => {
                const worker = workers.find(w => w.id === e.target.value);
                onWorkerSelect(worker);
              }}
              className="w-full appearance-none bg-bg border border-border text-text-main text-sm rounded-lg pl-3 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 hover:border-primary/50"
            >
              <option value="">选择Worker</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name || `Worker ${worker.id}`}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary group-hover:text-primary transition-colors duration-200 pointer-events-none" />
          </div>
          {selectedWorker && (
            <div className="mt-3 flex items-center justify-between px-1">
              <span className="text-xs text-text-secondary font-mono">
                :{selectedWorker.port}
              </span>
              {(() => {
                const config = getStatusConfig(selectedWorker.status);
                return (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${config.className}`}>
                    {config.label}
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* 导航菜单 */}
      <nav className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        <ul className="space-y-1.5">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                onClick={onMenuClick}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-primary text-white shadow-md shadow-primary/30 translate-x-1'
                      : 'text-text-secondary hover:bg-bg hover:text-text-main hover:translate-x-1'
                  }`
                }
              >
                <item.icon className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110`} />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            </li>
          ))}
          
          {/* 外部链接 */}
          <li>
            <a
              href="http://localhost:8080/swagger/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group text-text-secondary hover:bg-bg hover:text-text-main hover:translate-x-1"
            >
              <FileText className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
              <span className="font-medium">API 文档</span>
            </a>
          </li>
        </ul>
      </nav>

      {/* 底部信息 */}
      <div className="p-4 border-t border-border bg-gray-50/50">
        <div className="text-xs text-text-secondary text-center space-y-1">
          <p className="font-medium">WhatsApp Master UI</p>
          <p className="opacity-75">v1.0.0</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
