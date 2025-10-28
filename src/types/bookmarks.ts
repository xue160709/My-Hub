export interface BookmarkTag {
  url: string; // Corresponds to BookmarkTreeNode.url (primary key)
  tags: string[];
}

export interface EnhancedBookmark extends chrome.bookmarks.BookmarkTreeNode {
  tags?: string[];
  dateLastUsed?: number;
  children?: EnhancedBookmark[];
}

export interface BookmarkOrganization {
  bookmarkId: string;
  url?: string;
  newParentId?: string;
  tags?: string[];
}
