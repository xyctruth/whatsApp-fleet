import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// 组件导入
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import WorkerManager from './pages/WorkerManager';
import WhatsAppControl from './pages/WhatsAppControl';
import Messages from './pages/Messages';
import Settings from './pages/Settings';
import LoadingSpinner from './components/LoadingSpinner';
import { useI18n } from './i18n/index.js';

// 服务导入
import { masterService } from './services/api';

function App() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [systemHealth, setSystemHealth] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // 初始化应用
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 初始化 WhatsApp Master UI...');
      
      // 检查系统健康状态
      await checkSystemHealth();
      
      // 加载Worker列表
      await loadWorkers();
      
      console.log('✅ 应用初始化完成');
    } catch (error) {
      console.error('❌ 应用初始化失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSystemHealth = async () => {
    try {
      const response = await masterService.getHealth();
      setSystemHealth(response.data);
      console.log('✅ 系统健康检查完成');
    } catch (error) {
      console.error('❌ 系统健康检查失败:', error);
      setSystemHealth({ success: false, message: t('system.connectionFailed') });
    }
  };

  const loadWorkers = async () => {
    try {
      const response = await masterService.getAccounts();
      if (response.data.success) {
        const workerList = response.data.data || [];
        setWorkers(workerList);
        
        // 尝试从 URL 参数获取 workerId
        const params = new URLSearchParams(window.location.search);
        const urlWorkerId = params.get('workerId');
        
        // 尝试从 localStorage 获取
        const storedWorkerId = localStorage.getItem('selectedWorkerId');
        
        const targetId = urlWorkerId || storedWorkerId;
        
        let targetWorker = null;
        if (targetId) {
            targetWorker = workerList.find(w => w.id === targetId);
        }
        
        // 如果找到了目标worker，选中它
        if (targetWorker) {
            setSelectedWorker(targetWorker);
        } else if (!selectedWorker && workerList.length > 0) {
          // 如果没有选中的worker且没有历史记录，选择第一个
          setSelectedWorker(workerList[0]);
        }
      }
    } catch (error) {
      console.error('❌ 加载Worker列表失败:', error);
      setWorkers([]);
    }
  };

  // 监听 selectedWorker 变化，更新 URL 和 localStorage
  useEffect(() => {
      if (selectedWorker) {
          // Update URL without reloading
          const url = new URL(window.location);
          url.searchParams.set('workerId', selectedWorker.id);
          window.history.pushState({}, '', url);
          
          // Save to localStorage
          localStorage.setItem('selectedWorkerId', selectedWorker.id);
      }
  }, [selectedWorker]);

  // 如果正在加载，显示加载页面
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <h2 className="mt-4 text-xl font-semibold text-gray-700">
            {t('app.loading.title')}
          </h2>
          <p className="mt-2 text-gray-500">
            {t('app.loading.subtitle')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              style: {
                background: '#25D366',
              },
            },
            error: {
              style: {
                background: '#ef4444',
              },
            },
          }}
        />
        
        <div className="flex">
          {/* 侧边栏 */}
          <Sidebar 
            systemHealth={systemHealth}
            selectedWorker={selectedWorker}
            workers={workers}
            onWorkerSelect={setSelectedWorker}
            onMenuClick={() => setRefreshKey(prev => prev + 1)}
          />
          
          {/* 主内容区域 */}
          <div className="flex-1 flex flex-col">
            {/* 头部 */}
            <Header 
              selectedWorker={selectedWorker}
              onRefresh={() => {
                checkSystemHealth();
                loadWorkers();
                setRefreshKey(prev => prev + 1);
              }}
            />
            
            {/* 页面内容 */}
            <main className="flex-1 p-6">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route 
                  path="/dashboard" 
                  element={
                    <Dashboard 
                      key={refreshKey}
                      systemHealth={systemHealth}
                      workers={workers}
                      onRefresh={loadWorkers}
                    />
                  } 
                />
                <Route 
                  path="/workers" 
                  element={
                    <WorkerManager 
                      key={refreshKey}
                      workers={workers}
                      onRefresh={loadWorkers}
                      onWorkerSelect={setSelectedWorker}
                    />
                  } 
                />
                <Route 
                  path="/whatsapp" 
                  element={
                    <WhatsAppControl 
                      key={refreshKey}
                      selectedWorker={selectedWorker}
                      workers={workers}
                      onWorkerSelect={setSelectedWorker}
                      onRefresh={loadWorkers}
                    />
                  } 
                />
                <Route 
                  path="/messages" 
                  element={
                    <Messages 
                      key={refreshKey}
                      selectedWorker={selectedWorker}
                    />
                  } 
                />
                <Route 
                  path="/settings" 
                  element={
                    <Settings 
                      systemHealth={systemHealth}
                      onRefresh={checkSystemHealth}
                    />
                  } 
                />
              </Routes>
            </main>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
