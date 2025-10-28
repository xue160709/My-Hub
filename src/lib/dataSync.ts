import { getAllBookmarkTags, clearAllBookmarkTags, addBookmarkTag } from '../db/indexedDB';
import { WebCombo } from '../pages/newtab/types';
import { BookmarkTag } from '../types/bookmarks';

interface ExportedBookmarkNode {
  title: string;
  url?: string;
  children?: ExportedBookmarkNode[];
}

interface ExportData {
  bookmarks: ExportedBookmarkNode[];
  tags: BookmarkTag[];
  combos: WebCombo[];
  noMoreDisplayed: string[];
}

const buildExportTree = (node: chrome.bookmarks.BookmarkTreeNode): ExportedBookmarkNode => {
    const newNode: ExportedBookmarkNode = {
      title: node.title,
    };
    if (node.url) {
      newNode.url = node.url;
    }
    if (node.children) {
      newNode.children = node.children.map(buildExportTree);
    }
    return newNode;
  };

export const exportData = async (): Promise<void> => {
  try {
    const [bookmarkTree] = await chrome.bookmarks.getTree();
    const tags = await getAllBookmarkTags();
    const combos = JSON.parse(localStorage.getItem('webCombos') || '[]');
    const noMoreDisplayed = JSON.parse(localStorage.getItem('noMoreDisplayed') || '[]');

    const exportedBookmarks = bookmarkTree.children ? bookmarkTree.children.map(buildExportTree) : [];

    const data: ExportData = {
      bookmarks: exportedBookmarks,
      tags,
      combos,
      noMoreDisplayed,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `chrome_history_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting data:', error);
    alert('An error occurred while exporting your data. Please try again.');
  }
};

const getAllBookmarkUrls = async (): Promise<Set<string>> => {
    const urlSet = new Set<string>();
    const [tree] = await chrome.bookmarks.getTree();
    const traverse = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const node of nodes) {
        if (node.url) {
          urlSet.add(node.url);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    if (tree.children) {
      traverse(tree.children);
    }
    return urlSet;
  };

  const importBookmarksByName = async (
    nodes: ExportedBookmarkNode[],
    parentId: string,
    existingUrls: Set<string>
  ) => {
    const parentChildren = await chrome.bookmarks.getChildren(parentId);
  
    for (const node of nodes) {
      if (node.url) { // It's a bookmark
        if (!existingUrls.has(node.url)) {
          await chrome.bookmarks.create({
            parentId,
            title: node.title,
            url: node.url,
          });
          existingUrls.add(node.url);
        }
      } else if (node.children) { // It's a folder
        let folder = parentChildren.find(c => !c.url && c.title === node.title);
        if (!folder) {
          folder = await chrome.bookmarks.create({
            parentId,
            title: node.title,
          });
        }
        await importBookmarksByName(node.children, folder.id, existingUrls);
      }
    }
  };


export const importData = async (file: File): Promise<void> => {
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const json = event.target?.result as string;
      const data: ExportData = JSON.parse(json);

      const existingUrls = await getAllBookmarkUrls();

      // Import Bookmarks
      // Merges bookmarks from the import file into the existing bookmark structure by matching folder names.
      if (data.bookmarks && data.bookmarks.length > 0) {
        const [rootNode] = await chrome.bookmarks.getTree();
        const chromeTopLevelFolders = rootNode.children || [];

        for (const importedTopFolder of data.bookmarks) {
          if (importedTopFolder.children && importedTopFolder.children.length > 0) {
            const matchingChromeFolder = chromeTopLevelFolders.find(
              (chromeFolder) => !chromeFolder.url && chromeFolder.title === importedTopFolder.title
            );

            if (matchingChromeFolder) {
              await importBookmarksByName(importedTopFolder.children, matchingChromeFolder.id, existingUrls);
            } else {
              console.warn(
                `Top-level bookmark folder "${importedTopFolder.title}" not found in Chrome. Skipping import for this folder.`
              );
            }
          }
        }
      }

      // Import Tags
      if (data.tags) {
        await clearAllBookmarkTags();
        for (const tag of data.tags) {
          await addBookmarkTag(tag);
        }
      }

      // Import Combos
      if (data.combos) {
        localStorage.setItem('webCombos', JSON.stringify(data.combos));
      }

      // Import No More Displayed
      if (data.noMoreDisplayed) {
        localStorage.setItem('noMoreDisplayed', JSON.stringify(data.noMoreDisplayed));
      }

      alert('Data imported successfully! Please reload the page to see the changes.');
    } catch (error) {
      console.error('Error importing data:', error);
      alert('An error occurred while importing your data. Please check the file format and try again.');
    }
  };
  reader.readAsText(file);
};
