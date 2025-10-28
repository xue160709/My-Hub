import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useEnhancedHistory } from '../hooks/useEnhancedHistory';
import { HistoryItem } from '../types';
import { ItemCard } from './ItemCard';
import { DateNavigator } from '../../../components/DateNavigator';
import { SelectionActionBar, ActionItem } from '../../../components/SelectionActionBar';
import { format, startOfDay, endOfDay, setHours } from 'date-fns';
import { Modal } from '../../../components/Modal';
import AddBookmarkForm from './AddBookmarkForm';
import UnifiedSearchBar from '../../../components/UnifiedSearchBar';

const getFaviconUrl = (url: string) => `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;

// Reusable Confirmation Modal
const ConfirmationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}> = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full">
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end space-x-4">
          <button onClick={onClose} className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition">Delete</button>
        </div>
      </div>
    </div>
  );
};

export const HistoryPage: React.FC = () => {
  const {
    historyItems,
    devices,
    isLoading,
    filters,
    setFilters,
    deleteHistoryByUrl,
    deleteHistoryByDateRange,
    hasMore,
    loadMore,
    availableDates,
  } = useEnhancedHistory();

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [itemToAddBookmark, setItemToAddBookmark] = useState<HistoryItem | null>(null);

  const mainContentRef = useRef<HTMLElement | null>(null);

  const handleScroll = useCallback(() => {
    const element = mainContentRef.current;
    if (element) {
        const { scrollTop, scrollHeight, clientHeight } = element;
        if (scrollTop + clientHeight >= scrollHeight - 300 && hasMore && !isLoading) {
            loadMore();
        }
    }
  }, [hasMore, isLoading, loadMore]);

  useEffect(() => {
    const element = mainContentRef.current;
    if (element) {
        element.addEventListener('scroll', handleScroll);
        return () => {
            element.removeEventListener('scroll', handleScroll);
        };
    }
  }, [handleScroll]);


  const handleDateChange = useCallback(({ startTime, endTime }: { startTime: number; endTime: number }) => {
    setFilters(prev => ({ ...prev, startTime, endTime }));
  }, [setFilters]);
  
  const handleHourChange = useCallback((hour: number) => {
    const currentStartDate = new Date(filters.startTime);
    const newStart = setHours(currentStartDate, hour);
    const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000 - 1);
    setFilters(prev => ({ ...prev, startTime: newStart.getTime(), endTime: newEnd.getTime() }));
  }, [filters.startTime, setFilters]);

  const toggleSelection = (url: string) => {
    setSelectedItems(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const groupedHistory = useMemo(() => {
    const isAllMode = filters.startTime === 0;
    return historyItems.reduce((acc, item) => {
      const date = new Date(item.lastVisitTime);
      const key = isAllMode 
        ? format(date, 'yyyy-MM-dd HH:00') // 显示日期和小时
        : format(date, 'HH:00'); // 只显示小时
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {} as Record<string, HistoryItem[]>);
  }, [historyItems, filters.startTime]);

  const handleDeleteSingleItem = (url: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete History Item',
      message: 'Are you sure you want to delete this item and all its history?',
      onConfirm: () => deleteHistoryByUrl(url),
    });
  };

  const handleOpenBookmarkModal = (item: HistoryItem) => {
    setItemToAddBookmark(item);
    setIsBookmarkModalOpen(true);
  };

  const handleDeleteSelected = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Selected Items',
      message: `Are you sure you want to delete ${selectedItems.length} items? This action cannot be undone.`,
      onConfirm: () => {
        selectedItems.forEach(url => deleteHistoryByUrl(url));
        setIsMultiSelectMode(false);
        setSelectedItems([]);
      },
    });
  };

  const itemActions = (item: HistoryItem) => [{
    label: 'Add Bookmark',
    icon: 'bookmark_add',
    onClick: () => handleOpenBookmarkModal(item),
  }, {
    label: 'Delete',
    icon: 'delete',
    onClick: () => handleDeleteSingleItem(item.url),
  }];

  const handleCancelSelection = () => {
    setIsMultiSelectMode(false);
    setSelectedItems([]);
  };

  const historyActions: ActionItem[] = [
    {
      label: 'Delete Selected',
      onClick: handleDeleteSelected,
      className: 'text-red-600 hover:text-red-800',
    },
  ];

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <DateNavigator onDateChange={handleDateChange} availableDates={availableDates} />
          <div className="flex items-center space-x-2">
            <div className="w-64">
              <UnifiedSearchBar
                mode="history"
                value={filters.search}
                onChange={value => setFilters(prev => ({...prev, search: value}))}
                placeholder="Search in history"
                loading={isLoading}
              />
            </div>
            <button onClick={() => setIsMultiSelectMode(!isMultiSelectMode)} className={`px-4 py-2 text-sm font-semibold rounded-full ${isMultiSelectMode ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {isMultiSelectMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </div>
      </header>
      
      <main ref={mainContentRef} className="flex-1 overflow-y-auto pt-6 -mx-6 px-6">
        {isLoading && historyItems.length === 0 ? (
          <p className="text-center text-gray-500">Loading history...</p>
        ) : historyItems.length > 0 ? (
          <div className="space-y-8">
            {Object.entries(groupedHistory).sort(([a], [b]) => b.localeCompare(a)).map(([timeKey, items]) => {
              const isAllMode = filters.startTime === 0;
              const displayTitle = isAllMode 
                ? (() => {
                    const [dateStr, hourStr] = timeKey.split(' ');
                    const date = new Date(dateStr);
                    const today = new Date();
                    const yesterday = new Date(today);
                    yesterday.setDate(today.getDate() - 1);
                    
                    let dateLabel;
                    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
                      dateLabel = 'Today';
                    } else if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
                      dateLabel = 'Yesterday';
                    } else {
                      dateLabel = format(date, 'MMM dd, yyyy');
                    }
                    return `${dateLabel} ${hourStr}`;
                  })()
                : timeKey;
              
              return (
                <div key={timeKey}>
                  <h3 className="font-bold text-gray-800 mb-4 text-lg">{displayTitle}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {items.map(item => (
                      <ItemCard
                        key={item.url}
                        href={item.url}
                        title={item.title}
                        hostname={new URL(item.url).hostname}
                        faviconUrl={getFaviconUrl(item.url)}
                        actions={itemActions(item)}
                        visitCount={item.visitCount}
                        timeLabel={format(new Date(item.lastVisitTime), 'p')}
                        isMultiSelectMode={isMultiSelectMode}
                        isSelected={selectedItems.includes(item.url)}
                        onSelect={() => toggleSelection(item.url)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
             {isLoading && historyItems.length > 0 && (
                <p className="text-center text-gray-500 py-4">Loading more...</p>
            )}
          </div>
        ) : (
          <p className="text-center text-gray-500 pt-16">No history found for this day.</p>
        )}
      </main>

      <SelectionActionBar
        selectionCount={selectedItems.length}
        actions={historyActions}
        onCancel={handleCancelSelection}
      />

      <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} />
      
      <Modal isOpen={isBookmarkModalOpen} onClose={() => setIsBookmarkModalOpen(false)} title="Add Bookmark">
        {itemToAddBookmark && (
          <AddBookmarkForm
            initialUrl={itemToAddBookmark.url}
            initialTitle={itemToAddBookmark.title}
            onSuccess={() => {
              setIsBookmarkModalOpen(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
};
