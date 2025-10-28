import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useBookmarks } from '../hooks/useBookmarks';
import { EnhancedBookmark } from '../../../types/bookmarks';
import { SortOrder } from '../types';
import { BookmarkFolderTree } from './BookmarkFolderTree';
import TagInput from '../../../components/TagInput';
import { ItemCard } from './ItemCard';
import { formatDate } from '../utils';
import BookmarkTree from '../../../components/BookmarkTree';
import { SelectionActionBar, ActionItem } from '../../../components/SelectionActionBar';
import { AutoOrganizeModal } from './AutoOrganizeModal';
import { OrganizeBookmarksModal } from '../../../components/OrganizeBookmarksModal';
import { OrganizeProgressModal } from '../../../components/OrganizeProgressModal';
import { exportBookmarksToHTML } from '../../../lib/bookmarkExport';
import { organizeBookmarksBatch, OrganizeProgress } from '../../../services/bookmarkOrganizeService';
import UnifiedSearchBar from '../../../components/UnifiedSearchBar';
import { getAllBookmarkTags } from '../../../db/indexedDB';
import { buildTagGenerationPrompt } from '../../../lib/tagGenerationPrompts';
import { sendMessage } from '../../../services/llmService';


const useClickOutside = (ref: React.RefObject<any>, handler: () => void) => {
    useEffect(() => {
      const listener = (event: MouseEvent | TouchEvent) => {
        if (!ref.current || ref.current.contains(event.target as Node)) {
          return;
        }
        handler();
      };
      document.addEventListener('mousedown', listener);
      document.addEventListener('touchstart', listener);
      return () => {
        document.removeEventListener('mousedown', listener);
        document.removeEventListener('touchstart', listener);
      };
    }, [ref, handler]);
};

const ReorderConfirmModal: React.FC<{
    onClose: () => void;
    onConfirm: () => void;
    sortOrderText: string;
    isLoading: boolean;
}> = ({ onClose, onConfirm, sortOrderText, isLoading }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="card w-full max-w-lg p-8">
                <h3 className="text-lg font-bold mb-4">确认更新顺序</h3>
                <p>是否要按照 **{sortOrderText}** 的顺序更新当前文件夹下的 Chrome 书签显示顺序？</p>
                <p className="text-sm text-gray-500 mt-2">此操作会真实改变您在Chrome中的书签顺序，且不可撤销。</p>
                <div className="flex justify-end space-x-4 mt-8">
                    <button onClick={onClose} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition" disabled={isLoading}>取消</button>
                    <button onClick={onConfirm} className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition disabled:opacity-50" disabled={isLoading}>
                        {isLoading ? '更新中...' : '确认'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// =================================================================================
// Helper Functions
// =================================================================================

const findFolder = (nodes: EnhancedBookmark[], id: string): EnhancedBookmark | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFolder(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

const flattenBookmarks = (nodes: EnhancedBookmark[]): EnhancedBookmark[] => {
  let flat: EnhancedBookmark[] = [];
  for (const node of nodes) {
    if (node.url) { // It's a bookmark
        flat.push(node);
    }
    if (node.children) {
        flat = flat.concat(flattenBookmarks(node.children));
    }
  }
  return flat;
};

const getFaviconUrl = (url: string) => `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;


// =================================================================================
// Sub-components
// =================================================================================

const AddTagsModal: React.FC<{
    onClose: () => void;
    onSave: (tags: string[]) => void;
}> = ({ onClose, onSave }) => {
    const [tags, setTags] = useState<string[]>([]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="card w-full max-w-lg p-8">
                <h3 className="text-lg font-bold mb-6">Add Tags</h3>
                <TagInput tags={tags} setTags={setTags} />
                <div className="flex justify-end space-x-4 mt-8">
                    <button onClick={onClose} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition">Cancel</button>
                    <button onClick={() => onSave(tags)} className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition">Save</button>
                </div>
            </div>
        </div>
    );
};

const MoveBookmarksModal: React.FC<{
    onClose: () => void;
    onMove: (targetParentId: string) => void;
}> = ({ onClose, onMove }) => {
    const [targetId, setTargetId] = useState('1');
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="card w-full max-w-lg p-8">
                <h3 className="text-lg font-bold mb-6">Move to Folder</h3>
                <BookmarkTree selectedFolder={targetId} setSelectedFolder={setTargetId} />
                <div className="flex justify-end space-x-4 mt-8">
                    <button onClick={onClose} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition">Cancel</button>
                    <button onClick={() => onMove(targetId)} className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition">Move</button>
                </div>
            </div>
        </div>
    );
};

const EditModal: React.FC<{
    item: EnhancedBookmark;
    onClose: () => void;
    onSave: (id: string, newTitle: string, newUrl: string, newTags: string[], newParentId: string) => void;
    moveBookmark: (id: string, newParentId: string) => Promise<void>;
}> = ({ item, onClose, onSave, moveBookmark }) => {
    const [title, setTitle] = useState(item.title);
    const [url, setUrl] = useState(item.url || '');
    const [tags, setTags] = useState(item.tags || []);
    const [parentId, setParentId] = useState(item.parentId || '1');
    const [isGenerating, setIsGenerating] = useState(false);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const hasAutoSuggestedRef = useRef(false);

    const unwrapCodeFence = (text: string): string => {
        if (!text) return '';
        const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        return (fenced ? fenced[1] : text).trim();
    };

    const handleGenerateTags = async () => {
        if (!title || !url) {
            setStatusMessage('请先填写标题和URL');
            return;
        }

        setIsGenerating(true);
        setStatusMessage('正在生成标签...');

        const controller = new AbortController();
        setAbortController(controller);

        try {
            const existingBookmarkTags = await getAllBookmarkTags();
            const allExistingTags = Array.from(new Set(
                existingBookmarkTags.flatMap((bookmark: { tags: string[] }) => bookmark.tags)
            ));

            const systemPrompt = buildTagGenerationPrompt(allExistingTags);
            const userMessage = `标题: "${title}"\nURL: "${url}"`;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ];

            let generatedContent = '';

            await sendMessage(
                messages,
                {
                    onUpdate: (chunk: string) => {
                        generatedContent += chunk;
                    },
                    onFinish: () => {
                        const finalContent = unwrapCodeFence(generatedContent);
                        if (finalContent) {
                            const generatedTags = finalContent
                                .trim()
                                .split(',')
                                .map(tag => tag.trim())
                                .filter(tag => tag.length > 0);
                            setTags(generatedTags);
                            setStatusMessage(`成功生成 ${generatedTags.length} 个标签`);
                        } else {
                            setStatusMessage('标签生成完成，但未获得有效结果');
                        }
                        setIsGenerating(false);
                        setAbortController(null);
                    },
                    onError: (error: Error) => {
                        console.error('生成标签失败:', error);
                        setStatusMessage(`生成标签失败: ${error.message}`);
                        setIsGenerating(false);
                        setAbortController(null);
                    },
                },
                controller.signal
            );
        } catch (error) {
            console.error('生成标签出错:', error);
            setStatusMessage('生成标签出错，请稍后重试');
            setIsGenerating(false);
            setAbortController(null);
        }
    };

    const handleCancelGeneration = () => {
        if (abortController) {
            abortController.abort();
            setAbortController(null);
            setIsGenerating(false);
            setStatusMessage('已取消生成');
        }
    };

    // 打开弹窗时，若开启自动建议，则自动生成标签（与 AddBookmarkForm 保持一致）
    useEffect(() => {
        const autoSuggestEnabled = JSON.parse(localStorage.getItem('autoSuggestBookmarkInfo') || 'false');
        if (autoSuggestEnabled && title && url && !hasAutoSuggestedRef.current) {
            hasAutoSuggestedRef.current = true;
            handleGenerateTags();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = () => {
        onSave(item.id, title, url, tags, parentId);
        onClose();
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="card w-full max-w-lg p-8">
                <h3 className="text-lg font-bold mb-6">Edit Bookmark</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-gray-600">Title</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 px-4 py-2 bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"/>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-600">URL</label>
                        <input type="text" value={url} onChange={e => setUrl(e.target.value)} className="w-full mt-1 px-4 py-2 bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"/>
                    </div>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-600">Tags</label>
                        {isGenerating ? (
                            <button
                                onClick={handleCancelGeneration}
                                className="px-3 py-1 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                            >
                                取消
                            </button>
                        ) : (
                            <button
                                onClick={() => handleGenerateTags()}
                                disabled={!title || !url}
                                className="px-3 py-1 text-xs bg-black text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                            >
                                AI
                            </button>
                        )}
                    </div>
                    <TagInput tags={tags} setTags={setTags} />
                    {statusMessage && (
                        <p className="mt-2 text-xs text-gray-500">{statusMessage}</p>
                    )}
                </div>
                    <div>
                        <label className="text-sm font-medium text-gray-600">Folder</label>
                        <BookmarkTree selectedFolder={parentId} setSelectedFolder={setParentId} />
                    </div>
                </div>
                <div className="flex justify-end space-x-4 mt-8">
                    <button onClick={onClose} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition">Cancel</button>
                    <button onClick={handleSave} className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition">Save</button>
                </div>
            </div>
        </div>
    )
}


// =================================================================================
// Main Component
// =================================================================================

export const BookmarkPage: React.FC = () => {
  const { 
    bookmarks, 
    loading, 
    deleteBookmark, 
    updateBookmark, 
    updateBookmarkTags, 
    sortOrder, 
    updateSortOrder,
    createFolder,
    renameFolder,
    deleteFolder,
    moveBookmark,
    isMultiSelectMode,
    selectedBookmarkIds,
    toggleMultiSelectMode,
    toggleBookmarkSelection,
    moveBookmarks,
    addTagsToBookmarks,
    deleteBookmarks,
    clearSelection,
    reorderBookmarksInChrome,
    isBulkUpdating,
    refreshBookmarks,
    applyBookmarkOrganization,
    applyBookmarkOrganizationBatch
  } = useBookmarks();

  const [selectedFolderId, setSelectedFolderId] = useState('1'); // '1' is usually the bookmarks bar
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<EnhancedBookmark | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(moreMenuRef, () => setShowMoreMenu(false));
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isAddTagsModalOpen, setIsAddTagsModalOpen] = useState(false);
  const [showReorderConfirm, setShowReorderConfirm] = useState(false);
  const [isAutoOrganizeModalOpen, setIsAutoOrganizeModalOpen] = useState(false);
  const [organizeMenuOpen, setOrganizeMenuOpen] = useState(false);
  const organizeMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(organizeMenuRef, () => setOrganizeMenuOpen(false));
  
  // AI整理书签相关状态
  const [isOrganizeModalOpen, setIsOrganizeModalOpen] = useState(false);
  const [isOrganizeProgressModalOpen, setIsOrganizeProgressModalOpen] = useState(false);
  const [organizeProgress, setOrganizeProgress] = useState<OrganizeProgress>({
    currentBatch: 0,
    totalBatches: 0,
    processedCount: 0,
    totalCount: 0,
    currentStatus: ''
  });
  const [organizeAbortController, setOrganizeAbortController] = useState<AbortController | null>(null);

  const handleAutoOrganizeModalClose = (refresh?: boolean) => {
    setIsAutoOrganizeModalOpen(false);
    if (refresh) {
      refreshBookmarks();
    }
  };

  // AI整理书签处理函数
  const handleOrganizeConfirm = async (action: 'export' | 'organize') => {
    console.log('[BookmarkPage] 用户确认AI整理操作:', action);
    setIsOrganizeModalOpen(false);
    
    if (action === 'export') {
      console.log('[BookmarkPage] 执行导出书签操作');
      exportBookmarksToHTML(bookmarks);
      return; // 导出后直接返回
    }
    
    // 开始整理流程
    console.log('[BookmarkPage] 开始AI整理书签流程');
    setIsOrganizeProgressModalOpen(true);
    
    const controller = new AbortController();
    setOrganizeAbortController(controller);

    console.log('[BookmarkPage] 开始AI整理书签流程', bookmarks);
    
    try {
      await organizeBookmarksBatch(
        bookmarks,
        bookmarks,
        (progress: OrganizeProgress) => {
          console.log('[BookmarkPage] 整理进度更新:', progress);
          setOrganizeProgress(progress);
        },
        applyBookmarkOrganizationBatch,
        controller.signal
      );
      
      console.log('[BookmarkPage] AI整理书签完成或中止');
      
      // 刷新书签数据
      await refreshBookmarks();
      
      // 如果操作不是被中止的，那么就显示完成
      if (!controller.signal.aborted) {
        setOrganizeProgress(prev => ({ ...prev, currentStatus: '整理完成！可以关闭窗口。' }));
      }
      
    } catch (error) {
      console.error('[BookmarkPage] AI整理书签失败:', error);
      setOrganizeProgress(prev => ({ 
        ...prev, 
        currentStatus: `整理失败: ${error instanceof Error ? error.message : '未知错误'}` 
      }));
    } finally {
      setOrganizeAbortController(null);
    }
  };

  const handleOrganizeProgressClose = () => {
    console.log('[BookmarkPage] 关闭整理进度对话框');
    if (organizeAbortController) {
      if (window.confirm('正在进行AI整理，确定要中止吗？')) {
        console.log('[BookmarkPage] 用户确认中止，取消整理操作');
        organizeAbortController.abort();
        setOrganizeAbortController(null);
      } else {
        console.log('[BookmarkPage] 用户取消中止操作');
        return; // 如果用户取消，则不关闭对话框
      }
    }
    setIsOrganizeProgressModalOpen(false);
    setOrganizeProgress({
      currentBatch: 0,
      totalBatches: 0,
      processedCount: 0,
      totalCount: 0,
      currentStatus: ''
    });
    // 强制刷新一下数据，以防有部分应用的结果
    refreshBookmarks();
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [key, order] = e.target.value.split('-') as [SortOrder['key'], SortOrder['order']];
    updateSortOrder({ key, order });
  };

  const selectedFolder = useMemo(() => findFolder(bookmarks, selectedFolderId), [bookmarks, selectedFolderId]);
  const allBookmarksFlat = useMemo(() => flattenBookmarks(bookmarks), [bookmarks]);
  
  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    return allBookmarksFlat.filter(
      item =>
        item.title.toLowerCase().includes(term) ||
        (item.url && item.url.toLowerCase().includes(term)) ||
        (item.tags && item.tags.some(tag => tag.toLowerCase().includes(term)))
    );
  }, [searchTerm, allBookmarksFlat]);

  const handleDelete = (id: string) => {
      if(window.confirm("Are you sure you want to delete this bookmark?")) {
          deleteBookmark(id);
      }
  }

  const handleSaveEdit = async (id: string, newTitle: string, newUrl: string, newTags: string[], newParentId: string) => {
    const originalItem = findFolder(bookmarks, id);
    if (!originalItem) return;

    // Update title/url if changed
    if (originalItem.title !== newTitle || originalItem.url !== newUrl) {
      await updateBookmark(id, { title: newTitle, url: newUrl });
    }

    // Update tags if changed
    const tagsChanged = JSON.stringify(originalItem.tags?.sort()) !== JSON.stringify(newTags.sort());
    if (tagsChanged) {
        await updateBookmarkTags(id, newTags);
    }

    // Move if folder changed
    if (originalItem.parentId !== newParentId) {
        await moveBookmark(id, newParentId);
    }
  }

  const handleConfirmReorder = async () => {
    if (!selectedFolder || !selectedFolder.children) return;

    // 复制并排序子项目，文件夹优先
    const sortedChildren = [...selectedFolder.children].sort((a, b) => {
      const aIsFolder = !a.url;
      const bIsFolder = !b.url;

      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;

      // 如果两者都是文件夹或都是书签，则按当前排序规则排序
      const aVal = a[sortOrder.key] || 0;
      const bVal = b[sortOrder.key] || 0;

      if (aVal < bVal) return sortOrder.order === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder.order === 'asc' ? 1 : -1;
      
      return 0;
    });

    const reorderedIds = sortedChildren.map(item => item.id);
    await reorderBookmarksInChrome(reorderedIds);
    setShowReorderConfirm(false);
  };

  const handleBulkMove = async (targetParentId: string) => {
    await moveBookmarks(selectedBookmarkIds, targetParentId);
    setIsMoveModalOpen(false);
    toggleMultiSelectMode(); // also clears selection
  };

  const handleBulkAddTags = async (tags: string[]) => {
      if (tags.length > 0) {
          await addTagsToBookmarks(selectedBookmarkIds, tags);
      }
      setIsAddTagsModalOpen(false);
      toggleMultiSelectMode(); // also clears selection
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedBookmarkIds.length} bookmarks?`)) {
      deleteBookmarks(selectedBookmarkIds);
      toggleMultiSelectMode();
    }
  };

  const bookmarkPageActions: ActionItem[] = [
    {
      label: 'Move to folder...',
      onClick: () => setIsMoveModalOpen(true),
      className: "text-main hover:text-gray-600",
      disabled: selectedBookmarkIds.length === 0,
    },
    {
      label: 'Add tags...',
      onClick: () => setIsAddTagsModalOpen(true),
      className: "text-main hover:text-gray-600",
      disabled: selectedBookmarkIds.length === 0,
    },
    {
      label: 'Delete',
      onClick: handleBulkDelete,
      className: 'text-red-600 hover:text-red-800',
      disabled: selectedBookmarkIds.length === 0,
    },
  ];

  const bookmarksToDisplay = useMemo(() => {
    if (searchTerm) {
      return searchResults;
    }
    if (selectedFolder) {
      const flatBookmarks = flattenBookmarks(selectedFolder.children || []);
      // Re-sort the flattened bookmarks
      return flatBookmarks.sort((a, b) => {
        const aVal = a[sortOrder.key] || 0;
        const bVal = b[sortOrder.key] || 0;

        if (aVal < bVal) {
          return sortOrder.order === 'asc' ? -1 : 1;
        }
        if (aVal > bVal) {
          return sortOrder.order === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return [];
  }, [searchTerm, searchResults, selectedFolder, sortOrder]);

  const bookmarkActions = (item: EnhancedBookmark) => [
    {
      label: 'Edit',
      icon: 'edit',
      onClick: () => setEditingItem(item),
    },
    {
      label: 'Delete',
      icon: 'delete',
      onClick: () => handleDelete(item.id),
    },
  ];

  if (loading) {
    return <p className="text-center text-secondary">Loading bookmarks...</p>;
  }

  return (
    <div className="flex h-full pl-10">
      <aside className="w-1/5 min-w-[120px] h-full pr-4 border-r border-gray-200 relative z-20  overflow-y-auto pt-10 ">
        <div className="flex justify-between items-center mb-4 pr-2">
            <h2 className="text-xl font-bold text-main">Folders</h2>
            <div className="relative" ref={organizeMenuRef}>
                <button onClick={() => setOrganizeMenuOpen(!organizeMenuOpen)} className="p-1 rounded-full hover:bg-gray-200 transition">
                    <span className="material-symbols-outlined icon-linear text-lg">more_horiz</span>
                </button>
                {organizeMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
                        <div className="py-1">
                            <div
                                onClick={() => {
                                    setIsAutoOrganizeModalOpen(true);
                                    setOrganizeMenuOpen(false);
                                }}
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                            >
                                AI生成文件夹结构
                            </div>
                            <div
                                onClick={() => {
                                    console.log('[BookmarkPage] 用户点击AI整理书签');
                                    setIsOrganizeModalOpen(true);
                                    setOrganizeMenuOpen(false);
                                }}
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                            >
                                AI整理书签
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
        <BookmarkFolderTree 
          nodes={bookmarks} 
          selectedFolderId={selectedFolderId} 
          onSelectFolder={setSelectedFolderId}
          createFolder={createFolder}
          renameFolder={renameFolder}
          deleteFolder={deleteFolder}
        />
      </aside>
      
      <main className="flex-1 h-full overflow-y-auto">
        <header className="sticky top-0 z-5 flex items-center justify-between bg-[#F9F9F9] pb-4 pt-10 px-8 ">
          <h2 className="text-xl font-bold text-main">
            {isMultiSelectMode ? `Selected ${selectedBookmarkIds.length} items` : (searchTerm ? `Search Results for "${searchTerm}"` : selectedFolder?.title || 'Bookmarks')}
          </h2>
          <div className="flex items-center space-x-4">
            <div className="w-64">
                <UnifiedSearchBar
                    mode="bookmark"
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Search in bookmarks..."
                    loading={loading}
                />
            </div>
            <div className="relative">
                <select 
                    value={`${sortOrder.key}-${sortOrder.order}`}
                    onChange={handleSortChange}
                    className="bg-secondary border-none rounded-full px-4 py-2 text-main appearance-none focus:ring-2 focus:ring-gray-300 transition cursor-pointer"
                >
                    <option value="dateAdded-desc">按添加日期(降序)</option>
                    <option value="dateAdded-asc">按添加日期(升序)</option>
                    <option value="dateLastUsed-desc">按最近使用(降序)</option>
                    <option value="dateLastUsed-asc">按最近使用(升序)</option>
                    <option value="title-asc">按名称(A-Z)</option>
                    <option value="title-desc">按名称(Z-A)</option>
                </select>
            </div>
            <div className="relative" ref={moreMenuRef}>
                <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="p-2 rounded-full bg-secondary hover:bg-gray-200 transition">
                    <span className="material-symbols-outlined icon-linear text-lg">more_vert</span>
                </button>
                {showMoreMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
                        <div className="py-1">
                            <div
                                onClick={() => {
                                    toggleMultiSelectMode();
                                    setShowMoreMenu(false);
                                }}
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                            >
                                Select
                            </div>
                            <div
                                onClick={() => {
                                    setShowReorderConfirm(true);
                                    setShowMoreMenu(false);
                                }}
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                            >
                                更新Chrome书签顺序
                            </div>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6 px-8">
            {bookmarksToDisplay.length > 0 ? bookmarksToDisplay.map(item => {
              const dateToDisplay = sortOrder.key === 'dateLastUsed' ? item.dateLastUsed : item.dateAdded;
              
              return (
                <ItemCard
                    key={item.id}
                    href={item.url!}
                    title={item.title}
                    hostname={new URL(item.url!).hostname}
                    faviconUrl={getFaviconUrl(item.url!)}
                    tags={item.tags}
                    actions={bookmarkActions(item)}
                    timeLabel={dateToDisplay ? formatDate(dateToDisplay) : undefined}
                    isMultiSelectMode={isMultiSelectMode}
                    isSelected={selectedBookmarkIds.includes(item.id)}
                    onSelect={() => toggleBookmarkSelection(item.id)}
                />
              );
            }) : (
                <p className="text-center text-secondary pt-10 col-span-full">
                    {searchTerm ? "No results found." : "This folder is empty."}
                </p>
            )}
        </div>
      </main>

      {editingItem && (
        <EditModal 
            item={editingItem} 
            onClose={() => setEditingItem(null)} 
            onSave={handleSaveEdit}
            moveBookmark={moveBookmark}
        />
      )}

      {isMoveModalOpen && <MoveBookmarksModal onClose={() => setIsMoveModalOpen(false)} onMove={handleBulkMove} />}
      {isAddTagsModalOpen && <AddTagsModal onClose={() => setIsAddTagsModalOpen(false)} onSave={handleBulkAddTags} />}
      
      {showReorderConfirm && (() => {
        const sortOrderOptions: { [key: string]: string } = {
            'dateAdded-desc': '按添加日期(降序)',
            'dateAdded-asc': '按添加日期(升序)',
            'dateLastUsed-desc': '按最近使用(降序)',
            'dateLastUsed-asc': '按最近使用(升序)',
            'title-asc': '按名称(A-Z)',
            'title-desc': '按名称(Z-A)',
        };
        const currentSortText = sortOrderOptions[`${sortOrder.key}-${sortOrder.order}`];

        return (
            <ReorderConfirmModal
                onClose={() => setShowReorderConfirm(false)}
                onConfirm={handleConfirmReorder}
                sortOrderText={currentSortText}
                isLoading={isBulkUpdating}
            />
        )
      })()}

      {isAutoOrganizeModalOpen && (
        <AutoOrganizeModal
          isOpen={isAutoOrganizeModalOpen}
          onClose={handleAutoOrganizeModalClose}
          bookmarks={bookmarks}
          createFolder={createFolder}
          renameFolder={renameFolder}
          deleteFolder={deleteFolder}
          isBulkUpdating={isBulkUpdating}
          applyBookmarkOrganization={applyBookmarkOrganization}
        />
      )}

      {isOrganizeModalOpen && (
        <OrganizeBookmarksModal
          onClose={() => {
            console.log('[BookmarkPage] 用户关闭AI整理确认对话框');
            setIsOrganizeModalOpen(false);
          }}
          onConfirm={handleOrganizeConfirm}
          isLoading={isOrganizeProgressModalOpen}
        />
      )}

      {isOrganizeProgressModalOpen && (
        <OrganizeProgressModal
          isOpen={isOrganizeProgressModalOpen}
          onClose={handleOrganizeProgressClose}
          progress={(organizeProgress.processedCount / Math.max(organizeProgress.totalCount, 1)) * 100}
          currentBatch={organizeProgress.currentBatch}
          totalBatches={organizeProgress.totalBatches}
          processedCount={organizeProgress.processedCount}
          totalCount={organizeProgress.totalCount}
          currentStatus={organizeProgress.currentStatus}
          canClose={organizeAbortController === null && organizeProgress.currentStatus.includes('完成')}
        />
      )}

      <SelectionActionBar
        selectionCount={selectedBookmarkIds.length}
        actions={bookmarkPageActions}
        onCancel={toggleMultiSelectMode}
      />
    </div>
  );
};
