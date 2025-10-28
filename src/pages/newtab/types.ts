// =================================================================================
// Types based on PRD
// =================================================================================

export interface HistoryItem {
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
  favicon: string;
  deviceId: string;
  deviceName: string;
}

export interface Device {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface RecommendationItem
  extends Omit<HistoryItem, 'visitCount' | 'deviceId' | 'deviceName'> {
  /**
   * The number of unique days the item was visited within the specified time window.
   */
  visitsInWindow: number;
  /**
   * Whether this item is from bookmarks
   */
  isBookmark?: boolean;
  /**
   * Tags associated with the bookmark (only for bookmark items)
   */
  tags?: string[];
}

export interface SortOrder {
  key: 'dateAdded' | 'dateLastUsed' | 'title';
  order: 'asc' | 'desc';
}

export interface WebCombo {
  id: string;
  title: string;
  urls: string[];
}