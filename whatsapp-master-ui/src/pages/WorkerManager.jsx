import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Server, Trash2, Edit, Play, Pause, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { masterService, workerService } from '../services/api';
import { useI18n } from '../i18n/index.js';

const WorkerManager = ({ workers, onRefresh, onWorkerSelect }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [workerStatuses, setWorkerStatuses] = useState({});

  // 批量获取所有worker的实时状态
  const fetchRealtimeStatuses = async () => {
    setRefreshing(true);
    const statusMap = {};
    const timestamp = Date.now();
    
    // 并行请求所有worker的状态
    const promises = workers.map(async (worker) => {
        try {
            // 使用 workerService.getLoginStatus 获取状态
            // 添加时间戳防止缓存
            const response = await workerService.getLoginStatus(worker.id, { params: { _t: timestamp } });
            if (response.data.success) {
                // response.data.data.status 才是真正的 worker 状态
                statusMap[worker.id] = response.data.data?.status || response.data.status || worker.status;
            } else {
                // 如果请求失败（例如后端返回 502），且原状态是 stopped，保持 stopped
                // 否则标记为 error
                statusMap[worker.id] = worker.status === 'stopped' ? 'stopped' : 'error';
            }
        } catch (error) {
            console.error(`Worker ${worker.id} status check failed:`, error);
            // 如果请求超时或失败，且原来不是stopped，可能挂了
            statusMap[worker.id] = worker.status === 'stopped' ? 'stopped' : 'error';
        }
    });

    await Promise.all(promises);
    setWorkerStatuses(statusMap);
    setRefreshing(false);
  };

  useEffect(() => {
      if (workers.length > 0) {
          setTimeout(() => { fetchRealtimeStatuses(); }, 0);
      }
  }, [workers]);

  const handleDeleteWorker = async (workerId) => {
    if (!confirm('Are you sure to delete this Worker?')) return;
    
    try {
      const response = await masterService.deleteAccount(workerId);
      
      if (response.data.success) {
        toast.success('Worker deleted');
        onRefresh();
      } else {
        toast.error(response.data.message || 'Failed to delete Worker');
      }
    } catch (error) {
      console.error('Failed to delete Worker:', error);
      toast.error('Failed to delete Worker');
    }
  };

  const handleRestartWorker = async (workerId) => {
    try {
      const response = await workerService.restart(workerId);
      if (response.data.success) {
        toast.success('已触发重启更新');
        // 刷新列表和状态
        onRefresh && onRefresh();
        fetchRealtimeStatuses();
      } else {
        toast.error(response.data.message || '重启更新失败');
      }
    } catch (error) {
      console.error('重启更新失败:', error);
      toast.error('重启更新请求失败');
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'logged_in':
      case 'online':
      case 'connected':
        return { label: t('status.online'), className: 'status-online' };
      case 'running':
      case 'waiting_for_qr':
      case 'waiting_for_phone':
        return { label: t('status.running'), className: 'status-info' };
      case 'stopped':
      case 'offline':
      case 'logged_out':
        return { label: t('status.offline'), className: 'status-offline' };
      case 'error':
        return { label: t('status.error'), className: 'status-error' };
      default:
        return { label: status || t('status.connecting'), className: 'status-warning' };
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main flex items-center gap-3">
             {t('sidebar.menu.workers')}
             <button 
                onClick={() => { onRefresh(); fetchRealtimeStatuses(); }} 
                className={`p-2 rounded-full hover:bg-bg text-text-secondary transition-all ${refreshing ? 'animate-spin text-primary' : ''}`}
                title="刷新状态"
             >
                <RefreshCw className="w-5 h-5" />
             </button>
          </h1>
          <p className="text-text-secondary mt-1">Manage all WhatsApp Worker instances</p>
        </div>
        <button
          onClick={() => {
            onWorkerSelect(null);
            navigate('/whatsapp');
          }}
          className="btn-primary flex items-center space-x-2 shadow-lg shadow-primary/30 hover:shadow-primary/50"
        >
          <Plus className="w-4 h-4" />
          <span>Connect New Account</span>
        </button>
      </div>

      {/* Worker列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workers.map((worker) => (
          <div key={worker.id} className="card group hover:shadow-xl transition-all duration-300 border border-border hover:border-primary/30 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-150 duration-500"></div>
            
            <div className="flex items-start justify-between mb-6 relative z-10">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                  <Server className="w-7 h-7 text-primary group-hover:text-white transition-colors duration-300" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-text-main">
                    {worker.name || `Worker ${worker.id}`}
                  </h3>
                  <p className="text-sm text-text-secondary font-mono bg-bg px-2 py-0.5 rounded mt-1 inline-block">:{worker.port}</p>
                </div>
              </div>
              {(() => {
                // 优先使用实时状态，否则使用列表中的状态
                const currentStatus = workerStatuses[worker.id] || worker.status;
                const statusConfig = getStatusConfig(currentStatus);
                return (
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusConfig.className}`}>
                    {statusConfig.label}
                  </span>
                );
              })()}
            </div>

            <div className="space-y-3 mb-6 relative z-10 bg-bg/50 p-4 rounded-xl">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Status</span>
                <span className="font-medium text-text-main font-mono">
                    {workerStatuses[worker.id] || worker.status}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Created</span>
                <span className="font-medium text-text-main">
                  {worker.created_at ? new Date(worker.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              {worker.description && (
                <div className="text-sm text-text-secondary border-t border-border/50 pt-2 mt-2">
                  {worker.description}
                </div>
              )}
            </div>

            <div className="flex space-x-3 relative z-10">
              <button
                onClick={() => {
                  onWorkerSelect(worker);
                  navigate('/whatsapp');
                }}
                className="btn-primary flex-1 py-2.5 text-sm shadow-md shadow-primary/20"
              >
                Use
              </button>
              <button
                onClick={() => handleRestartWorker(worker.id)}
                className="p-2.5 rounded-lg text-primary hover:bg-primary/10 hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                title="重启更新Worker"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleDeleteWorker(worker.id)}
                className="p-2.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-100"
                title="删除Worker"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}

        {workers.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 bg-surface rounded-3xl border-2 border-dashed border-border">
            <div className="w-20 h-20 bg-bg rounded-full flex items-center justify-center mb-6">
              <Server className="w-10 h-10 text-text-secondary" />
            </div>
            <h3 className="text-xl font-bold text-text-main mb-2">{t('dashboard.noWorkers')}</h3>
            <p className="text-text-secondary mb-8">Connect your first WhatsApp account to get started</p>
            <button
              onClick={() => {
                onWorkerSelect(null);
                navigate('/whatsapp');
              }}
              className="btn-primary px-8 py-3 shadow-lg shadow-primary/30"
            >
              Connect New Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerManager;
