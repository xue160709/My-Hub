import { HistoryItem } from '../pages/newtab/types';

export type SearchResultItem = (HistoryItem & { type: 'history' }) | (chrome.bookmarks.BookmarkTreeNode & { type: 'bookmark' });
