import { useState, useEffect, useCallback, useRef } from 'react';
import { EnhancedBookmark, BookmarkOrganization } from '../../../types/bookmarks';
import { getAllBookmarkTags, addBookmarkTag, deleteBookmarkTag, batchUpdateTags, getBookmarkTag } from '../../../db/indexedDB';
import { SortOrder } from '../types';
import { applyNewBookmarkTree, GeneratedNode } from '../utils';

const STORAGE_KEY = 'bookmark_sort_order';
const DEFAULT_SORT_ORDER: SortOrder = { key: 'dateAdded', order: 'desc' };

const getSortOrderFromStorage = (): SortOrder => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error reading sort order from localStorage:', error);
  }
  return DEFAULT_SORT_ORDER;
};

const setSortOrderInStorage = (sortOrder: SortOrder) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortOrder));
  } catch (error) {
    console.error('Error saving sort order to localStorage:', error);
  }
};

const mergeTagsIntoBookmarks = (
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  tagsMap: Map<string, string[]>
): EnhancedBookmark[] => {
  return nodes.map(node => {
    const enhancedNode: EnhancedBookmark = {
      ...node,
      // 使用 URL 作为主键匹配标签，只有书签（有URL）才有标签
      tags: node.url ? (tagsMap.get(node.url) || []) : [],
    };
    if (node.children) {
      enhancedNode.children = mergeTagsIntoBookmarks(node.children, tagsMap);
    }
    return enhancedNode;
  });
};

const addHistoryDataRecursively = async (nodes: EnhancedBookmark[]): Promise<EnhancedBookmark[]> => {
  return Promise.all(
    nodes.map(async node => {
      const processedNode: EnhancedBookmark = { ...node };

      if (node.url) {
        try {
          const visits = await chrome.history.getVisits({ url: node.url });
          if (visits && visits.length > 0) {
            processedNode.dateLastUsed = visits[0].visitTime;
          }
        } catch (e) {
          // It can fail for URLs like chrome://newtab/, which is fine.
        }
      }

      if (node.children) {
        processedNode.children = await addHistoryDataRecursively(node.children);
      }

      return processedNode;
    })
  );
};

const sortBookmarksRecursively = (
  nodes: EnhancedBookmark[],
  sortOrder: SortOrder
): EnhancedBookmark[] => {
  const sortedNodes = [...nodes].sort((a, b) => {
    const aIsFolder = !a.url;
    const bIsFolder = !b.url;

    if (aIsFolder !== bIsFolder) {
      return aIsFolder ? -1 : 1;
    }

    const { key, order } = sortOrder;
    
    if (key === 'title') {
      const titleA = a.title.toLowerCase();
      const titleB = b.title.toLowerCase();
      if (titleA === titleB) return 0;
      const result = titleA.localeCompare(titleB);
      return order === 'asc' ? result : -result;
    }
    
    let valA = 0;
    let valB = 0;

    if (key === 'dateLastUsed') {
      valA = a.dateLastUsed || 0;
      valB = b.dateLastUsed || 0;
    } else {
      valA = a.dateAdded || 0;
      valB = b.dateAdded || 0;
    }

    if (valA === valB) return 0;

    return order === 'asc' ? valA - valB : valB - valA;
  });

  return sortedNodes.map(node => {
    if (node.children && node.children.length > 0) {
      return { ...node, children: sortBookmarksRecursively(node.children, sortOrder) };
    }
    return node;
  });
};

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<EnhancedBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>(getSortOrderFromStorage);
  const [rawBookmarks, setRawBookmarks] = useState<EnhancedBookmark[]>([]);
  // 多选模式状态管理
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const isBulkUpdatingRef = useRef(isBulkUpdating);

  useEffect(() => {
    isBulkUpdatingRef.current = isBulkUpdating;
  }, [isBulkUpdating]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const bookmarkTree = await chrome.bookmarks.getTree();
      const allTags = await getAllBookmarkTags();
      // 使用 URL 作为主键构建映射表
      const tagsMap = new Map(allTags.map(bt => [bt.url, bt.tags]));

      const mergedBookmarks = mergeTagsIntoBookmarks(bookmarkTree[0].children || [], tagsMap);
      const bookmarksWithHistory = await addHistoryDataRecursively(mergedBookmarks);
      console.log('Processed bookmarks data:', JSON.stringify(bookmarksWithHistory, null, 2));
      setRawBookmarks(bookmarksWithHistory);
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
      setRawBookmarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const listener = () => {
      if (!isBulkUpdatingRef.current) {
        fetchData();
      }
    };
    chrome.bookmarks.onChanged.addListener(listener);
    chrome.bookmarks.onCreated.addListener(listener);
    chrome.bookmarks.onMoved.addListener(listener);
    chrome.bookmarks.onRemoved.addListener(listener);

    return () => {
      chrome.bookmarks.onChanged.removeListener(listener);
      chrome.bookmarks.onCreated.removeListener(listener);
      chrome.bookmarks.onMoved.removeListener(listener);
      chrome.bookmarks.onRemoved.removeListener(listener);
    };
  }, [fetchData]);

  useEffect(() => {
    const sorted = sortBookmarksRecursively(rawBookmarks, sortOrder);
    setBookmarks(sorted);
  }, [rawBookmarks, sortOrder]);

  const updateSortOrder = useCallback((newSortOrder: SortOrder) => {
    setSortOrderInStorage(newSortOrder);
    setSortOrder(newSortOrder);
  }, []);

  const updateBookmarkTags = async (id: string, tags: string[]) => {
    // 首先获取书签的 URL
    const bookmarkNodes = await chrome.bookmarks.get(id);
    const bookmarkUrl = bookmarkNodes[0]?.url;
    
    if (!bookmarkUrl) {
      console.error('Cannot update tags: bookmark URL not found for id:', id);
      return;
    }
    
    if (tags.length > 0) {
      await addBookmarkTag({ url: bookmarkUrl, tags });
    } else {
      await deleteBookmarkTag(bookmarkUrl);
    }
    await fetchData(); // Re-fetch to update state
  };

  const deleteBookmark = async (id: string) => {
    try {
      const node = await chrome.bookmarks.get(id);
      if (node[0].children) {
        await chrome.bookmarks.removeTree(id);
      } else {
        await chrome.bookmarks.remove(id);
      }
      // Listener will auto-refresh
    } catch (error) {
      console.error(`Error deleting bookmark ${id}:`, error);
    }
  };

  const updateBookmark = async (id: string, changes: { title?: string, url?: string }) => {
    try {
      await chrome.bookmarks.update(id, changes);
      // Listener will auto-refresh
    } catch (error) {
      console.error(`Error updating bookmark ${id}:`, error);
    }
  };

  // 文件夹管理函数
  const createFolder = async (parentId: string, title: string) => {
    try {
      await chrome.bookmarks.create({ parentId, title });
      // Listener will auto-refresh
    } catch (error) {
      console.error(`Error creating folder:`, error);
    }
  };

  const renameFolder = async (id: string, newTitle: string) => {
    try {
      await chrome.bookmarks.update(id, { title: newTitle });
      // Listener will auto-refresh
    } catch (error) {
      console.error(`Error renaming folder ${id}:`, error);
    }
  };

  const deleteFolder = async (id: string, strategy: 'deleteAll' | 'moveContents') => {
    try {
      if (strategy === 'deleteAll') {
        await chrome.bookmarks.removeTree(id);
      } else {
        // 获取文件夹的子项
        const children = await chrome.bookmarks.getChildren(id);
        // 默认移动到书签栏（通常是 '1'）
        const bookmarkBar = await chrome.bookmarks.getTree();
        const bookmarkBarId = bookmarkBar[0].children?.find(child => child.title === '书签栏' || child.title === 'Bookmarks bar')?.id || '1';
        
        // 移动所有子项到书签栏
        for (const child of children) {
          await chrome.bookmarks.move(child.id, { parentId: bookmarkBarId });
        }
        
        // 删除空文件夹
        await chrome.bookmarks.remove(id);
      }
      // Listener will auto-refresh
    } catch (error) {
      console.error(`Error deleting folder ${id}:`, error);
    }
  };

  const moveBookmark = async (id: string, newParentId: string) => {
    try {
      await chrome.bookmarks.move(id, { parentId: newParentId });
      // Listener will auto-refresh
    } catch (error) {
      console.error(`Error moving bookmark ${id}:`, error);
    }
  };

  // 批量操作函数
  const moveBookmarks = async (ids: string[], targetParentId: string) => {
    setIsBulkUpdating(true);
    try {
      for (const id of ids) {
        await chrome.bookmarks.move(id, { parentId: targetParentId });
      }
      await fetchData();
    } catch (error) {
      console.error(`Error moving bookmarks:`, error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const addTagsToBookmarks = async (ids: string[], tags: string[]) => {
    try {
      const { batchUpdateTags } = await import('../../../db/indexedDB');
      const updates = await Promise.all(
        ids.map(async (id) => {
          // 获取书签的 URL
          const bookmarkNodes = await chrome.bookmarks.get(id);
          const bookmarkUrl = bookmarkNodes[0]?.url;
          
          if (!bookmarkUrl) {
            console.error('Cannot add tags: bookmark URL not found for id:', id);
            return null;
          }
          
          const { getBookmarkTag } = await import('../../../db/indexedDB');
          const existingTag = await getBookmarkTag(bookmarkUrl);
          const existingTags = existingTag?.tags || [];
          const newTags = [...new Set([...existingTags, ...tags])];
          return { url: bookmarkUrl, tags: newTags };
        })
      );
      
      // 过滤掉 null 值
      const validUpdates = updates.filter(update => update !== null) as { url: string; tags: string[] }[];
      
      if (validUpdates.length > 0) {
        await batchUpdateTags(validUpdates);
      }
      
      await fetchData(); // Re-fetch to update state
    } catch (error) {
      console.error(`Error adding tags to bookmarks:`, error);
    }
  };

  const deleteBookmarks = async (ids:string[]) => {
    setIsBulkUpdating(true);
    try {
      for (const id of ids) {
        await chrome.bookmarks.remove(id);
      }
      await fetchData();
    } catch (error) {
      console.error(`Error deleting bookmarks:`, error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const applyBookmarkOrganization = async (tree: GeneratedNode[]) => {
    setIsBulkUpdating(true);
    try {
      await applyNewBookmarkTree(tree);
      await fetchData();
    } catch (error) {
      console.error('Error applying bookmark organization:', error);
      // Optionally re-throw or handle error state here
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const applyBookmarkOrganizationBatch = async (plan: BookmarkOrganization[]) => {
    setIsBulkUpdating(true);
    try {
      const tagUpdates: { url: string; tags: string[] }[] = [];
      const moveOperations: { bookmarkId: string; newParentId: string }[] = [];

      for (const item of plan) {
        if (item.tags && item.url) {
          tagUpdates.push({ url: item.url, tags: item.tags });
        }
        if (item.newParentId) {
          moveOperations.push({ bookmarkId: item.bookmarkId, newParentId: item.newParentId });
        }
      }

      if (tagUpdates.length > 0) {
        // Final defensive check: filter out any updates that are missing a URL.
        const validTagUpdates = tagUpdates.filter(update => {
          if (!update.url) {
            console.warn('Filtering out a tag update because its URL is missing:', update);
            return false;
          }
          return true;
        });
        
        if (validTagUpdates.length > 0) {
          await batchUpdateTags(validTagUpdates);
        }
      }

      for (const op of moveOperations) {
        try {
          const bookmark = await chrome.bookmarks.get(op.bookmarkId);
          if (bookmark[0] && bookmark[0].parentId !== op.newParentId) {
            await chrome.bookmarks.move(op.bookmarkId, { parentId: op.newParentId });
          }
        } catch (error) {
          console.error(`Error moving bookmark ${op.bookmarkId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error applying bookmark organization batch:', error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // 多选模式管理
  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(!isMultiSelectMode);
    if (isMultiSelectMode) {
      setSelectedBookmarkIds([]);
    }
  };

  const toggleBookmarkSelection = (id: string) => {
    setSelectedBookmarkIds(prev => 
      prev.includes(id) 
        ? prev.filter(bookmarkId => bookmarkId !== id)
        : [...prev, id]
    );
  };

  const clearSelection = () => {
    setSelectedBookmarkIds([]);
  };

  const reorderBookmarksInChrome = async (orderedIds: string[]) => {
    setIsBulkUpdating(true);
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await chrome.bookmarks.move(orderedIds[i], { index: i });
      }
      await fetchData();
    } catch (error) {
      console.error('Error reordering bookmarks in Chrome:', error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return {
    bookmarks,
    loading,
    isBulkUpdating,
    sortOrder,
    updateSortOrder,
    updateBookmarkTags,
    deleteBookmark,
    updateBookmark,
    refreshBookmarks: fetchData,
    // 多选模式
    isMultiSelectMode,
    selectedBookmarkIds,
    toggleMultiSelectMode,
    toggleBookmarkSelection,
    clearSelection,
    // 文件夹管理
    createFolder,
    renameFolder,
    deleteFolder,
    moveBookmark,
    // 批量操作
    moveBookmarks,
    addTagsToBookmarks,
    deleteBookmarks,
    reorderBookmarksInChrome,
    applyBookmarkOrganization,
    applyBookmarkOrganizationBatch,
  };
}
