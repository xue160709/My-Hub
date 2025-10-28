import React from 'react';

interface OrganizeBookmarksModalProps {
  onClose: () => void;
  onConfirm: (action: 'export' | 'organize') => void;
  isLoading?: boolean;
}

export const OrganizeBookmarksModal: React.FC<OrganizeBookmarksModalProps> = ({ 
  onClose, 
  onConfirm, 
  isLoading = false 
}) => {
  console.log('[OrganizeBookmarksModal] 渲染确认对话框');
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg p-8">
        <h3 className="text-lg font-bold mb-4">AI整理书签</h3>
        <p className="text-gray-700 mb-6">
          请选择您希望的操作方式：
        </p>
        <div className="space-y-4">
          <button
            onClick={() => {
              console.log('[OrganizeBookmarksModal] 用户选择：导出并整理');
              onConfirm('export');
            }}
            disabled={isLoading}
            className="w-full p-4 text-left rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-medium">1. 导出已有书签并整理书签</div>
            <div className="text-sm text-gray-500 mt-1">
              先导出当前书签为HTML文件，然后进行AI整理
            </div>
          </button>
          
          <button
            onClick={() => {
              console.log('[OrganizeBookmarksModal] 用户选择：直接整理');
              onConfirm('organize');
            }}
            disabled={isLoading}
            className="w-full p-4 text-left rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-medium">2. 直接整理书签</div>
            <div className="text-sm text-gray-500 mt-1">
              直接使用AI整理根目录中的书签
            </div>
          </button>
        </div>
        
        <div className="flex justify-end space-x-4 mt-8">
          <button 
            onClick={() => {
              console.log('[OrganizeBookmarksModal] 用户取消操作');
              onClose();
            }} 
            disabled={isLoading}
            className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            3. 取消
          </button>
        </div>
      </div>
    </div>
  );
};
