import React from 'react';
import { Modal } from './Modal';

interface OrganizeProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: number;
  currentBatch: number;
  totalBatches: number;
  processedCount: number;
  totalCount: number;
  currentStatus: string;
  canClose?: boolean;
}

export const OrganizeProgressModal: React.FC<OrganizeProgressModalProps> = ({
  isOpen,
  onClose,
  progress,
  currentBatch,
  totalBatches,
  processedCount,
  totalCount,
  currentStatus,
  canClose = false
}) => {
  console.log('[OrganizeProgressModal] 渲染进度对话框', {
    progress,
    currentBatch,
    totalBatches,
    processedCount,
    totalCount,
    currentStatus
  });

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="AI整理书签进度"
      widthClass="max-w-md"
    >
      <div className="space-y-6">
        {/* 总体进度 */}
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>整体进度</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-black h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 批次进度 */}
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>当前批次</span>
            <span>{currentBatch} / {totalBatches}</span>
          </div>
          <div className="text-xs text-gray-500">
            已处理 {processedCount} / {totalCount} 个书签
          </div>
        </div>

        {/* 当前状态 */}
        <div>
          <div className="text-sm text-gray-600 mb-2">当前状态</div>
          <div className="text-sm bg-gray-50 p-3 rounded-lg">
            {currentStatus}
          </div>
        </div>

        {/* 加载动画 */}
        {!canClose && (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-600">正在处理中...</span>
          </div>
        )}

        {/* 完成后的关闭按钮 */}
        {canClose && (
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full text-white bg-blue-600 hover:bg-blue-700 transition"
            >
              完成
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
