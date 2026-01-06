import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, RefreshCw, Search, Filter } from 'lucide-react';
import { workerService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const Messages = ({ selectedWorker }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, received, sent

  useEffect(() => {
    if (selectedWorker) {
      loadMessages();
    }
  }, [selectedWorker]);

  const loadMessages = async () => {
    if (!selectedWorker) return;
    
    try {
      setLoading(true);
      const response = await workerService.getMessages();
      if (response.data.success) {
        setMessages(response.data.data || []);
      }
    } catch (error) {
      console.error('加载消息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = messages.filter(message => {
    const matchesSearch = !searchTerm || 
      message.body?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.from?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterType === 'all' ||
      (filterType === 'received' && !message.fromMe) ||
      (filterType === 'sent' && message.fromMe);
    
    return matchesSearch && matchesFilter;
  });

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return date.toLocaleDateString('zh-CN', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  if (!selectedWorker) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">请选择Worker</h3>
          <p className="text-gray-500">请在侧边栏选择一个Worker来查看消息</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">消息管理</h1>
          <p className="text-gray-600">
            当前Worker: {selectedWorker.name || `Worker ${selectedWorker.id}`}
          </p>
        </div>
        <button
          onClick={loadMessages}
          disabled={loading}
          className="btn-primary flex items-center space-x-2"
        >
          {loading ? <LoadingSpinner size="small" /> : <RefreshCw className="w-4 h-4" />}
          <span>刷新消息</span>
        </button>
      </div>

      {/* 搜索和筛选 */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* 搜索框 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索消息内容或联系人..."
              className="input-field pl-10"
            />
          </div>
          
          {/* 筛选器 */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="input-field min-w-32"
            >
              <option value="all">全部消息</option>
              <option value="received">接收的消息</option>
              <option value="sent">发送的消息</option>
            </select>
          </div>
        </div>
      </div>

      {/* 消息统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-gray-900">{messages.length}</div>
          <div className="text-sm text-gray-600">总消息数</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-green-600">
            {messages.filter(m => !m.fromMe).length}
          </div>
          <div className="text-sm text-gray-600">接收消息</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-blue-600">
            {messages.filter(m => m.fromMe).length}
          </div>
          <div className="text-sm text-gray-600">发送消息</div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          消息列表 ({filteredMessages.length})
        </h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="large" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {searchTerm || filterType !== 'all' ? '没有找到匹配的消息' : '暂无消息'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredMessages.map((message, index) => (
              <div
                key={message.id || index}
                className={`p-4 rounded-lg border ${
                  message.fromMe 
                    ? 'bg-blue-50 border-blue-200 ml-8' 
                    : 'bg-gray-50 border-gray-200 mr-8'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      message.fromMe ? 'bg-blue-500' : 'bg-green-500'
                    }`}></div>
                    <span className="font-medium text-gray-900">
                      {message.fromMe ? '我' : (message.from || '未知联系人')}
                    </span>
                    {message.fromMe && (
                      <Send className="w-3 h-3 text-blue-500" />
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                
                <div className="text-gray-800">
                  {message.body || '(无内容)'}
                </div>
                
                {message.type && message.type !== 'chat' && (
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                      {message.type}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Messages;
