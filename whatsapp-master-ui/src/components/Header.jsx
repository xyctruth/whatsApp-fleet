import React from 'react';
import { RefreshCw, Bell, User } from 'lucide-react';
import { useI18n } from '../i18n/index.js';

const Header = ({ selectedWorker, onRefresh }) => {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* 左侧：页面标题和Worker信息 */}
        <div className="flex items-center space-x-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {t('header.title')}
            </h2>
            {selectedWorker && (
              <p className="text-sm text-gray-500">
                {selectedWorker.name || `Worker ${selectedWorker.id}`}
              </p>
            )}
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center space-x-4">
          {/* 刷新按钮 */}
          <button
            onClick={onRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            title={t('header.refreshTitle')}
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {/* 通知按钮 */}
          <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
          </button>

          {/* 语言切换 */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 text-gray-700 hover:border-gray-400"
            title="Language"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>

          {/* 用户菜单 */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-sm font-medium text-gray-700">{t('header.admin')}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
