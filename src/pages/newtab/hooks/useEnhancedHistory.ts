import { useEffect, useState, useCallback } from 'react';
import { HistoryItem, Device } from '../types';
import { startOfDay, format } from 'date-fns';

export function useEnhancedHistory() {
  const [allHistory, setAllHistory] = useState<HistoryItem[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<HistoryItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<{
    search: string;
    device: string;
    startTime: number;
    endTime: number;
  }>({
    search: '',
    device: 'all',
    startTime: 0, // Default to all time
    endTime: Date.now(),
  });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const calculateHistoryScore = (item: HistoryItem) => {
    const ageInHours = (Date.now() - (item.lastVisitTime || 0)) / (1000 * 60 * 60);
    const gravity = 1.8;
    const score = (item.visitCount || 1) / Math.pow(ageInHours + 2, gravity);
    return score;
  };

  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  };

  // 初始加载时获取所有历史记录用于计算可用日期
  useEffect(() => {
    const fetchAvailableDates = async () => {
      if (!chrome.history) return;
      
      try {
        // 获取所有历史记录（不带时间筛选）来计算可用日期
        const allHistoryForDates = await chrome.history.search({
          text: '',
          startTime: 0,
          endTime: Date.now(),
          maxResults: 10000,
        });
        
        const dates = new Set<string>();
        allHistoryForDates.forEach(item => {
          if (item.lastVisitTime) {
            const dateKey = format(startOfDay(new Date(item.lastVisitTime)), 'yyyy-MM-dd');
            dates.add(dateKey);
          }
        });
        const sortedDates = Array.from(dates).sort().reverse();
        setAvailableDates(sortedDates);
      } catch (error) {
        console.error('Error fetching available dates:', error);
      }
    };
    
    fetchAvailableDates();
  }, []); // 只在组件挂载时执行一次

  const fetchHistory = useCallback(async () => {
    if (!chrome.history) {
      console.error('Chrome History API not available');  
      setIsLoading(false);
      return;
    }

    console.log('🔍 Fetching history for filters:', filters);
    setIsLoading(true);

    const currentDeviceName = 'Current Device';
    const deviceList: Device[] = [
      { id: 'all', name: 'All Devices', isCurrent: false },
      { id: currentDeviceName, name: `${currentDeviceName} (Current)`, isCurrent: true }
    ];
    
    console.log('📱 Available devices:', deviceList);
    console.log('🎯 Selected device filter:', filters.device);
    setDevices(deviceList);

    const urlMap = new Map<string, HistoryItem>();
    const getFaviconUrl = (url: string) => `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;

    const processHistoryItems = (items: (chrome.history.HistoryItem | {id: string, url: string, title: string, lastVisitTime: number, visitCount: number})[], deviceName: string) => {
        items.forEach(item => {
            if (!item.url || item.url.startsWith('chrome://') || item.url.startsWith('chrome-extension://')) {
                return;
            }
            const key = item.url;
            if (urlMap.has(key)) {
                const existing = urlMap.get(key)!;
                existing.visitCount += item.visitCount || 1;
                if ((item.lastVisitTime || 0) > existing.lastVisitTime) {
                    existing.lastVisitTime = item.lastVisitTime || 0;
                    existing.deviceName = deviceName;
                    existing.deviceId = deviceName;
                }
            } else {
                urlMap.set(key, {
                    url: item.url!,
                    title: item.title || item.url!,
                    visitCount: item.visitCount || 1,
                    lastVisitTime: item.lastVisitTime || 0,
                    favicon: getFaviconUrl(item.url!),
                    deviceId: deviceName,
                    deviceName: deviceName,
                });
            }
        });
    };

    // 只获取当前设备的历史记录
    console.log('📖 Fetching local history for current device');
    const localHistory = await chrome.history.search({
        text: filters.search,
        startTime: filters.startTime,
        endTime: filters.endTime,
        maxResults: 10000,
    });
    console.log(`✅ Found ${localHistory.length} local history items`);
    processHistoryItems(localHistory, currentDeviceName);

    const processedHistory = Array.from(urlMap.values()).sort((a, b) => b.lastVisitTime - a.lastVisitTime);
    console.log(`Processed history for filter "${filters.device}":`, processedHistory);

    setAllHistory(processedHistory);
    setIsLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);


  useEffect(() => {
    let filtered = [...allHistory];

    // Device filtering is now handled in fetchHistory, so this is redundant.
    // if (filters.device !== 'all') {
    //   filtered = filtered.filter(item => item.deviceId === filters.device);
    // }

    // The search filtering is now done in the API call, but we can keep this for client-side refinement if needed
    if (filters.search.trim()) {
      const term = filters.search.toLowerCase();
      filtered = filtered.filter(item => item.title.toLowerCase().includes(term) || item.url.toLowerCase().includes(term));
    }


    setFilteredHistory(filtered);
    setCurrentPage(1);
  }, [filters, allHistory]);

  const loadMore = () => {
    setCurrentPage(prev => prev + 1);
  };

  const deleteHistoryByUrl = async (url: string) => {
    if (!chrome.history) return;
    try {
      await chrome.history.deleteUrl({ url });
      await fetchHistory(); // Refetch after deletion
    } catch (error) {
      console.error(`Error deleting history for url: ${url}`, error);
    }
  };

  const deleteHistoryByDateRange = async (startTime: number, endTime: number) => {
    if (!chrome.history) return;
    try {
      await chrome.history.deleteRange({ startTime, endTime });
      await fetchHistory(); // Refetch after deletion
    } catch (error) {
      console.error(`Error deleting history for range: ${startTime} - ${endTime}`, error);
    }
  };


  return {
    historyItems: filteredHistory.slice(0, currentPage * PAGE_SIZE),
    hasMore: filteredHistory.length > currentPage * PAGE_SIZE,
    loadMore,
    devices,
    isLoading,
    filters,
    setFilters,
    deleteHistoryByUrl,
    deleteHistoryByDateRange,
    availableDates,
  };
}
