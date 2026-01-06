import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Settings as SettingsIcon, Database, Network } from 'lucide-react';
import toast from 'react-hot-toast';
import { masterService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const Settings = ({ systemHealth, onRefresh }) => {
  const [config, setConfig] = useState({
    system: {
      max_workers: 10,
      auto_restart: true,
      log_level: 'info',
      cleanup_interval: 3600
    },
    whatsapp: {
      message_timeout: 30000,
      login_timeout: 60000,
      retry_attempts: 3,
      auto_logout_inactive: false
    },
    api: {
      rate_limit: 100,
      cors_enabled: true,
      auth_required: false
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await masterService.getConfig();
      if (response.data.success) {
        setConfig(response.data.data || config);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      const response = await masterService.updateConfig(config);
      
      if (response.data.success) {
        toast.success('配置保存成功');
      } else {
        toast.error(response.data.message || '配置保存失败');
      }
    } catch (error) {
      console.error('保存配置失败:', error);
      toast.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
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
          <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
          <p className="text-gray-600">配置系统参数和WhatsApp设置</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => {
              onRefresh();
              loadConfig();
            }}
            disabled={loading}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>刷新</span>
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="btn-primary flex items-center space-x-2"
          >
            {saving ? <LoadingSpinner size="small" /> : <Save className="w-4 h-4" />}
            <span>保存配置</span>
          </button>
        </div>
      </div>

      {/* 系统状态概览 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Database className="w-5 h-5 mr-2" />
          系统状态
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className={`text-2xl font-bold ${
              systemHealth?.success ? 'text-green-600' : 'text-red-600'
            }`}>
              {systemHealth?.success ? '正常' : '异常'}
            </div>
            <div className="text-sm text-gray-600">Master服务</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">v1.0.0</div>
            <div className="text-sm text-gray-600">系统版本</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {new Date().toLocaleDateString()}
            </div>
            <div className="text-sm text-gray-600">启动时间</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">正常</div>
            <div className="text-sm text-gray-600">API状态</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 系统配置 */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <SettingsIcon className="w-5 h-5 mr-2" />
            系统配置
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                最大Worker数量
              </label>
              <input
                type="number"
                value={config.system.max_workers}
                onChange={(e) => updateConfig('system', 'max_workers', parseInt(e.target.value))}
                className="input-field"
                min="1"
                max="50"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                日志级别
              </label>
              <select
                value={config.system.log_level}
                onChange={(e) => updateConfig('system', 'log_level', e.target.value)}
                className="input-field"
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                清理间隔 (秒)
              </label>
              <input
                type="number"
                value={config.system.cleanup_interval}
                onChange={(e) => updateConfig('system', 'cleanup_interval', parseInt(e.target.value))}
                className="input-field"
                min="60"
              />
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="auto_restart"
                checked={config.system.auto_restart}
                onChange={(e) => updateConfig('system', 'auto_restart', e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="auto_restart" className="text-sm font-medium text-gray-700">
                自动重启失败的Worker
              </label>
            </div>
          </div>
        </div>

        {/* WhatsApp配置 */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Network className="w-5 h-5 mr-2" />
            WhatsApp配置
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                消息超时 (毫秒)
              </label>
              <input
                type="number"
                value={config.whatsapp.message_timeout}
                onChange={(e) => updateConfig('whatsapp', 'message_timeout', parseInt(e.target.value))}
                className="input-field"
                min="5000"
                step="1000"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                登录超时 (毫秒)
              </label>
              <input
                type="number"
                value={config.whatsapp.login_timeout}
                onChange={(e) => updateConfig('whatsapp', 'login_timeout', parseInt(e.target.value))}
                className="input-field"
                min="10000"
                step="1000"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                重试次数
              </label>
              <input
                type="number"
                value={config.whatsapp.retry_attempts}
                onChange={(e) => updateConfig('whatsapp', 'retry_attempts', parseInt(e.target.value))}
                className="input-field"
                min="1"
                max="10"
              />
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="auto_logout_inactive"
                checked={config.whatsapp.auto_logout_inactive}
                onChange={(e) => updateConfig('whatsapp', 'auto_logout_inactive', e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="auto_logout_inactive" className="text-sm font-medium text-gray-700">
                自动登出非活跃账号
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* API配置 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">API配置</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              速率限制 (请求/分钟)
            </label>
            <input
              type="number"
              value={config.api.rate_limit}
              onChange={(e) => updateConfig('api', 'rate_limit', parseInt(e.target.value))}
              className="input-field"
              min="10"
            />
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="cors_enabled"
              checked={config.api.cors_enabled}
              onChange={(e) => updateConfig('api', 'cors_enabled', e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="cors_enabled" className="text-sm font-medium text-gray-700">
              启用CORS
            </label>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="auth_required"
              checked={config.api.auth_required}
              onChange={(e) => updateConfig('api', 'auth_required', e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="auth_required" className="text-sm font-medium text-gray-700">
              需要身份验证
            </label>
          </div>
        </div>
      </div>

      {/* 危险操作 */}
      <div className="card border-red-200">
        <h3 className="text-lg font-semibold text-red-600 mb-4">危险操作</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div>
              <h4 className="font-medium text-red-800">重置所有配置</h4>
              <p className="text-sm text-red-600">将所有配置恢复为默认值</p>
            </div>
            <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
              重置配置
            </button>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div>
              <h4 className="font-medium text-red-800">清除所有数据</h4>
              <p className="text-sm text-red-600">删除所有Worker和消息数据</p>
            </div>
            <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
              清除数据
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
