import { EnhancedBookmark } from '../types/bookmarks';

/**
 * 检查是否是书签栏文件夹
 * 支持多语言和不同的ID分配
 */
const isBookmarksBarFolder = (node: EnhancedBookmark): boolean => {
  // 通过ID检查（最常见的情况）
  if (node.id === '1') return true;
  
  // 通过标题检查（支持多语言）
  const bookmarksBarNames = [
    'Bookmarks bar',     // English
    '书签栏',             // Chinese Simplified
    '書籤列',             // Chinese Traditional  
    'Barra de marcadores', // Spanish
    'Barre de favoris',  // French
    'Lesezeichen-Symbolleiste', // German
    'Панель закладок',   // Russian
    'ブックマークバー',      // Japanese
    '북마크 막대',        // Korean
    'Barra dos marcadores', // Portuguese
    'Barra dei segnalibri', // Italian
  ];
  
  return bookmarksBarNames.includes(node.title);
};

/**
 * 检查是否是移动书签文件夹
 * Chrome在某些版本中可能有移动书签文件夹
 */
const isMobileBookmarksFolder = (node: EnhancedBookmark): boolean => {
  // 通过ID检查（移动书签通常是ID='3'，但不是所有版本都有）
  if (node.id === '3') return true;
  
  // 通过标题检查
  const mobileBookmarksNames = [
    'Mobile bookmarks',  // English
    '移动书签',           // Chinese Simplified
    '行動書籤',           // Chinese Traditional
    'Marcadores móviles', // Spanish
    'Favoris mobiles',   // French
    'Mobile Lesezeichen', // German
    'Мобильные закладки', // Russian
    'モバイルブックマーク',   // Japanese
    '모바일 북마크',       // Korean
  ];
  
  return mobileBookmarksNames.includes(node.title);
};

/**
 * 将书签导出为Netscape Bookmark File Format (HTML)
 */
export const exportBookmarksToHTML = (bookmarks: EnhancedBookmark[]): void => {
  console.log('[BookmarkExport] 开始导出书签到HTML格式');
  
  const generateBookmarkHTML = (node: EnhancedBookmark, level = 0): string => {
    const indent = '    '.repeat(level);
    
    if (node.url) {
      // 这是一个书签
      const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : '';
      const lastVisit = node.dateLastUsed ? Math.floor(node.dateLastUsed / 1000) : '';
      const tagsStr = node.tags && node.tags.length > 0 ? ` TAGS="${node.tags.join(',')}"` : '';
      
      return `${indent}<DT><A HREF="${node.url}" ADD_DATE="${addDate}" LAST_VISIT="${lastVisit}"${tagsStr}>${node.title}</A>\n`;
    } else {
      // 这是一个文件夹
      const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : '';
      const lastModified = node.dateGroupModified ? Math.floor(node.dateGroupModified / 1000) : addDate;
      
      // 检查是否是特殊的根文件夹
      const isBookmarksBar = isBookmarksBarFolder(node);
      const isMobileBookmarks = isMobileBookmarksFolder(node);
      
      // 为特殊文件夹添加相应属性
      let folderAttributes = `ADD_DATE="${addDate}" LAST_MODIFIED="${lastModified}"`;
      if (isBookmarksBar) {
        folderAttributes += ' PERSONAL_TOOLBAR_FOLDER="true"';
      } else if (isMobileBookmarks) {
        // 移动书签文件夹的特殊属性（如果需要的话）
        // folderAttributes += ' MOBILE_BOOKMARKS_FOLDER="true"';
      }
      
      let html = `${indent}<DT><H3 ${folderAttributes}>${node.title}</H3>\n`;
      
      if (node.children && node.children.length > 0) {
        html += `${indent}<DL><p>\n`;
        for (const child of node.children) {
          html += generateBookmarkHTML(child, level + 1);
        }
        html += `${indent}</DL><p>\n`;
      } else {
        // 空文件夹也需要DL标签结构
        html += `${indent}<DL><p>\n`;
        html += `${indent}</DL><p>\n`;
      }
      
      return html;
    }
  };

  // 生成HTML头部
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  // 生成书签内容
  for (const bookmark of bookmarks) {
    html += generateBookmarkHTML(bookmark, 1);
  }

  // 添加HTML尾部
  html += `</DL><p>`;

  // 创建Blob并触发下载
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmarks_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('[BookmarkExport] 书签导出完成');
};
