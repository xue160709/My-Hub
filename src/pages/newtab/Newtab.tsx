import React, { useState } from 'react';
import '@pages/newtab/Newtab.css';
import { useMomentInHistory } from './hooks/useMomentInHistory';
import { useEnhancedHistory } from './hooks/useEnhancedHistory';
import { HomePage } from './components/HomePage';
import { HistoryPage } from './components/HistoryPage';
import { BookmarkPage } from './components/BookmarkPage';
import { Modal } from '../../components/Modal';
import SettingsPage from './components/SettingsPage';

// =================================================================================
// Main Component
// =================================================================================

// 定义页面类型的联合类型
type Page = 'home' | 'history' | 'bookmarks';

/**
 * Newtab 组件是新标签页面的主组件。
 * 它负责管理不同的页面视图（主页、历史记录、书签），并协调数据的获取与展示。
 */
export default function Newtab() {
  // 页面状态管理，用于在 'home', 'history', 'bookmarks' 之间切换
  const [page, setPage] = useState<Page>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // 自定义 hook，用于获取“历史上的今天”的推荐内容
  const { recommendations, timeRange } = useMomentInHistory();
  // 自定义 hook，用于获取、筛选和分页加载增强的历史记录
  const { historyItems, devices, isLoading, filters, setFilters, hasMore, loadMore } = useEnhancedHistory();

  return (
    <div className="flex h-screen">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white text-main p-6 flex flex-col border-r border-gray-200">
        <h1 className="text-3xl font-bold mb-12 text-main">My Hub</h1>
        {/* 导航菜单 */}
        <nav>
          <ul>
            {/* 主页链接 */}
            <li>
              <a
                className={`flex items-center py-3 px-4 rounded-full ${
                  page === 'home' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                }`}
                href="#"
                onClick={() => setPage('home')}>
                <span className="material-symbols-outlined icon-linear mr-4">home</span>
                Home
              </a>
            </li>
            {/* 书签页链接 */}
            <li className="mt-4">
              <a
                className={`flex items-center py-3 px-4 rounded-full ${
                  page === 'bookmarks'
                    ? 'bg-black text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                }`}
                href="#"
                onClick={() => setPage('bookmarks')}>
                <span className="material-symbols-outlined icon-linear mr-4">bookmark</span>
                Bookmarks
              </a>
            </li>
            {/* 历史记录页链接 */}
            <li className="mt-4">
              <a
                className={`flex items-center py-3 px-4 rounded-full ${
                  page === 'history'
                    ? 'bg-black text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                }`}
                href="#"
                onClick={() => setPage('history')}>
                <span className="material-symbols-outlined icon-linear mr-4">history</span>
                History
              </a>
            </li>
          </ul>
        </nav>

        {/* Settings Entry */}
        <div className="mt-auto">
            <a href="#" onClick={() => setIsSettingsOpen(true)} className="flex items-center py-3 px-4 rounded-full text-gray-500 hover:bg-gray-100 hover:text-black">
                <span className="material-symbols-outlined icon-linear mr-4">settings</span>
                Settings
            </a>
        </div>
      </aside>
      {/* 主内容区域 */}
      <main className="flex-1 overflow-y-auto bg-[#F9F9F9]">
        {/* 根据 page 状态条件渲染对应的页面组件 */}
        {page === 'home' ? (
          <HomePage recommendations={recommendations} timeRange={timeRange} />
        ) : page === 'history' ? (
          <HistoryPage />
        ) : (
          <BookmarkPage />
        )}
      </main>

      <Modal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        title="Settings"
        widthClass="max-w-4xl"
      >
        <SettingsPage onClose={() => setIsSettingsOpen(false)} />
      </Modal>
    </div>
  );
}
