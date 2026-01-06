import React, { useState, useEffect } from 'react';
import { 
  Server, 
  MessageSquare, 
  Users, 
  Activity,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { masterService, workerService } from '../services/api';
import { useI18n } from '../i18n/index.js';

const Dashboard = ({ systemHealth, workers, onRefresh }) => {
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pairingCodes, setPairingCodes] = useState({});

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await masterService.getStats();
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    const fetchCodes = async () => {
      if (!workers || workers.length === 0) {
        setPairingCodes({});
        return;
      }
      const result = {};
      for (const w of workers) {
        try {
          const resp = await workerService.getLoginStatus(w.id);
          const data = resp.data || {};
          const body = data.data || data;
          const code = body.pairing_code || body.pairingCode;
          if (code) {
            result[w.id] = code;
          }
        } catch (e) { void e; }
      }
      setPairingCodes(result);
    };
    fetchCodes();
  }, [workers]);

  const StatCard = ({ title, value, icon, color, change }) => {
    const IconComp = icon;
    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {change && (
              <p className={`text-sm flex items-center mt-1 ${
                change > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendingUp className="w-4 h-4 mr-1" />
                {change > 0 ? '+' : ''}{change}%
              </p>
            )}
          </div>
          <div className={`p-3 rounded-full ${color}`}>
            <IconComp className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
    );
  };

  const getWorkerStatusCount = (status) => {
    return workers.filter(worker => worker.status === status).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-600">{t('dashboard.subtitle')}</p>
        </div>
        <button
          onClick={() => {
            onRefresh();
            loadStats();
          }}
          className="btn-primary"
        >
          {t('dashboard.refresh')}
        </button>
      </div>

      {/* 系统状态警告 */}
      {!systemHealth?.success && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">{t('dashboard.alert.connectionError')}</h3>
              <p className="text-sm text-red-700 mt-1">{t('dashboard.alert.connectMasterFailed')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 配对码显示区域 */}
      {Object.keys(pairingCodes).length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center mb-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
            <h3 className="text-lg font-semibold text-yellow-800">🔐 {t('dashboard.pairing.pendingTitle')}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(pairingCodes).map(([workerId, code]) => (
              <div key={workerId} className="bg-white p-4 rounded-lg shadow-sm border border-yellow-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-100 rounded-bl-full -mr-8 -mt-8 z-0"></div>
                <div className="relative z-10">
                  <p className="text-sm font-medium text-gray-500 mb-1">{t('dashboard.pairing.accountId')}: {workerId}</p>
                  <p className="text-2xl font-bold text-yellow-600 tracking-wider font-mono">
                    {code ? code.match(/.{1,4}/g).join('-') : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-2 flex items-center">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-1.5 animate-pulse"></span>
                    {t('dashboard.pairing.enterOnPhone')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title={t('dashboard.stats.totalWorkers')}
          value={workers.length}
          icon={Server}
          color="bg-blue-500"
          change={5}
        />
        <StatCard
          title={t('dashboard.stats.onlineWorkers')}
          value={getWorkerStatusCount('online')}
          icon={Activity}
          color="bg-green-500"
          change={2}
        />
        <StatCard
          title={t('dashboard.stats.todayMessages')}
          value={stats?.todayMessages || 0}
          icon={MessageSquare}
          color="bg-whatsapp-green"
          change={12}
        />
        <StatCard
          title={t('dashboard.stats.activeContacts')}
          value={stats?.activeContacts || 0}
          icon={Users}
          color="bg-purple-500"
          change={-3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worker状态列表 */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.workerStatus')}</h3>
          <div className="space-y-3">
            {workers.length === 0 ? (
              <p className="text-gray-500 text-center py-4">{t('dashboard.noWorkers')}</p>
            ) : (
              workers.map((worker) => (
                <div key={worker.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      worker.status === 'online' ? 'bg-green-500' : 
                      worker.status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                    }`}></div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {worker.name || `Worker ${worker.id}`}
                      </p>
                      <p className="text-sm text-gray-500">{t('dashboard.port')}: {worker.port}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    worker.status === 'online' ? 'status-online' :
                    worker.status === 'offline' ? 'status-offline' : 'status-loading'
                  }`}>
                    {worker.status === 'online' ? t('status.online') :
                     worker.status === 'offline' ? t('status.offline') : t('status.connecting')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 系统信息 */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.systemInfo.title')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('dashboard.systemInfo.master')}</span>
              <span className={`font-medium ${
                systemHealth?.success ? 'text-green-600' : 'text-red-600'
              }`}>
                {systemHealth?.success ? t('dashboard.systemInfo.running') : t('dashboard.systemInfo.failed')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('dashboard.systemInfo.version')}</span>
              <span className="font-medium text-gray-900">v1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('dashboard.systemInfo.startTime')}</span>
              <span className="font-medium text-gray-900">
                {new Date().toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('dashboard.systemInfo.apiStatus')}</span>
              <span className="font-medium text-green-600">{t('dashboard.systemInfo.apiNormal')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 最近活动 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.recentActivity.title')}</h3>
        <div className="space-y-3">
          {[
            { time: '2分钟前', action: 'Worker-001 成功发送消息到联系人 张三', type: 'success' },
            { time: '5分钟前', action: 'Worker-002 登录状态检查完成', type: 'info' },
            { time: '10分钟前', action: 'Worker-003 接收到新消息', type: 'info' },
            { time: '15分钟前', action: '系统健康检查完成', type: 'success' },
          ].map((activity, index) => (
            <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className={`w-2 h-2 rounded-full mt-2 ${
                activity.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
              }`}></div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">{activity.action}</p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
