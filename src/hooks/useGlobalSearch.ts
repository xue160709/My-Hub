import { useState, useEffect } from 'react';
import { useBookmarks } from '../pages/newtab/hooks/useBookmarks';
import { SearchResultItem } from '../types/search';
import { EnhancedBookmark } from '../types/bookmarks';

const SEARCH_DEBOUNCE_TIME = 300; // ms

// 递归地从书签树中提取所有书签节点
const flattenBookmarks = (nodes: EnhancedBookmark[]): EnhancedBookmark[] => {
  const flattened: EnhancedBookmark[] = [];
  const traverse = (node: EnhancedBookmark) => {
    // 只添加有 URL 的书签，忽略文件夹
    if (node.url) {
      flattened.push(node);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  nodes.forEach(traverse);
  return flattened;
};

export const useGlobalSearch = (searchTerm: string) => {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const { bookmarks: allBookmarks, loading: bookmarksLoading } = useBookmarks();

  useEffect(() => {
    const search = async () => {
      if (!searchTerm) {
        setResults([]);
        return;
      }

      setLoading(true);

      // 1. 搜索历史记录
      const historyPromise = chrome.history.search({ text: searchTerm, maxResults: 100 })
        .then(historyItems => 
          historyItems.map(item => ({ ...item, type: 'history' as const }))
        );

      // 2. 搜索书签
      const flattenedBookmarks = flattenBookmarks(allBookmarks);
      const bookmarkPromise = new Promise<SearchResultItem[]>((resolve) => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const bookmarkResults = flattenedBookmarks
          .filter(bookmark =>
            bookmark.title.toLowerCase().includes(lowerCaseSearchTerm) ||
            (bookmark.url && bookmark.url.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (bookmark.tags && bookmark.tags.some(tag => tag.toLowerCase().includes(lowerCaseSearchTerm)))
          )
          .map(bookmark => ({ ...bookmark, type: 'bookmark' as const }));
        resolve(bookmarkResults);
      });

      // 并行执行所有搜索
      try {
        const [historyResults, bookmarkResults] = await Promise.all([historyPromise, bookmarkPromise]);
        
        // 合并并排序结果（这里简单合并，可以根据需求增加排序逻辑）
        setResults([...historyResults, ...bookmarkResults]);
      } catch (error) {
        console.error('Error during global search:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimeout = setTimeout(() => {
      search();
    }, SEARCH_DEBOUNCE_TIME);

    return () => clearTimeout(debounceTimeout);
  }, [searchTerm, allBookmarks]);

  return {
    loading: loading || bookmarksLoading,
    results,
  };
};
