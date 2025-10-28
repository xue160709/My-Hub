console.log('background script loaded');

import { deleteBookmarkTag, deleteMultipleBookmarkTags, getBookmarkTag, addBookmarkTag } from '../../db/indexedDB';

// 内存映射表：id -> url
const bookmarkIdToUrlMap = new Map<string, string>();

// 递归构建 id -> url 映射表
const buildIdUrlMapping = (node: chrome.bookmarks.BookmarkTreeNode): void => {
  // 如果是书签（有URL），添加到映射表
  if (node.url) {
    bookmarkIdToUrlMap.set(node.id, node.url);
  }
  
  // 递归处理子节点
  if (node.children) {
    for (const child of node.children) {
      buildIdUrlMapping(child);
    }
  }
};

// 初始化映射表
const initializeMapping = async (): Promise<void> => {
  try {
    const bookmarkTree = await chrome.bookmarks.getTree();
    console.log('Building id->url mapping from bookmark tree');
    
    // 遍历整个书签树构建映射
    bookmarkTree.forEach(rootNode => {
      buildIdUrlMapping(rootNode);
    });
    
    console.log(`Initialized mapping with ${bookmarkIdToUrlMap.size} bookmarks`);
  } catch (error) {
    console.error('Error initializing id->url mapping:', error);
  }
};

// 启动时初始化映射表
initializeMapping();

// 递归获取文件夹中所有书签的URL
const getAllBookmarkUrls = (node: chrome.bookmarks.BookmarkTreeNode): string[] => {
  const urls: string[] = [];
  
  // 如果是书签（有URL），添加到列表
  if (node.url) {
    urls.push(node.url);
  }
  
  // 递归处理子节点
  if (node.children) {
    for (const child of node.children) {
      urls.push(...getAllBookmarkUrls(child));
    }
  }
  
  return urls;
};

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (bookmark.url) {
    console.log('bookmark created, updating mapping', id, bookmark.url);
    const db = await openDB();
    const transaction = db.transaction('bookmarks', 'readwrite');
    const store = transaction.objectStore('bookmarks');
    store.put({ url: bookmark.url, bookmarkId: id });
    await transaction.done;
  }
});

// 监听书签删除事件
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log('bookmark removed, deleting from indexedDB', id);
  
  // 检查是否为文件夹（url 为空表示文件夹）
  if (!removeInfo.node.url) {
    console.log('folder removed, processing all contained bookmarks');
    // 获取文件夹中所有书签的URL
    const bookmarkUrls = getAllBookmarkUrls(removeInfo.node);
    
    if (bookmarkUrls.length > 0) {
      // 批量删除所有书签的标签数据
      deleteMultipleBookmarkTags(bookmarkUrls).catch(error => {
        console.error('Error deleting multiple bookmark tags:', error);
      });
    }
    
    // 从映射表中移除文件夹中的所有书签
    const removeFromMapping = (node: chrome.bookmarks.BookmarkTreeNode): void => {
      if (node.url) {
        bookmarkIdToUrlMap.delete(node.id);
      }
      if (node.children) {
        node.children.forEach(removeFromMapping);
      }
    };
    removeFromMapping(removeInfo.node);
  } else {
    // 单个书签删除 - 使用URL作为主键
    deleteBookmarkTag(removeInfo.node.url).catch(error => {
      console.error('Error deleting bookmark tag:', error);
    });
    
    // 从映射表中移除
    bookmarkIdToUrlMap.delete(id);
  }
});

// 监听书签变更事件（处理URL变更）
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  console.log('bookmark changed', id, changeInfo);
  
  // 检查是否为URL变更
  if (changeInfo.url) {
    console.log('URL changed, migrating tag data');
    
    try {
      // 从映射表中获取旧的URL
      const oldUrl = bookmarkIdToUrlMap.get(id);
      
      if (oldUrl && oldUrl !== changeInfo.url) {
        // 读取旧URL对应的标签数据
        const oldTagData = await getBookmarkTag(oldUrl);
        
        if (oldTagData) {
          // 删除旧记录
          await deleteBookmarkTag(oldUrl);
          
          // 使用新URL创建新记录
          await addBookmarkTag({
            url: changeInfo.url,
            tags: oldTagData.tags
          });
          
          console.log(`Migrated tag data from ${oldUrl} to ${changeInfo.url}`);
        }
        
        // 更新映射表
        bookmarkIdToUrlMap.set(id, changeInfo.url);
      }
    } catch (error) {
      console.error('Error migrating tag data on URL change:', error);
    }
  }
});