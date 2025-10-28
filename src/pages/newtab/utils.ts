// A simple utility to format time difference
export function timeAgo(timestamp: number): string {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) {
    return Math.floor(interval) + ' years ago';
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return Math.floor(interval) + ' months ago';
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return Math.floor(interval) + ' days ago';
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return Math.floor(interval) + ' hours ago';
  }
  interval = seconds / 60;
  if (interval > 1) {
    return Math.floor(interval) + ' minutes ago';
  }
  return Math.floor(seconds) + ' seconds ago';
}

export const formatDate = (timestamp: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

import { EnhancedBookmark } from '../../types/bookmarks';

// Type for folder structure sent to LLM
type LlmFolder = {
  title: string;
  children?: LlmFolder[];
};

// Extracts bookmarks into a structured object for the LLM prompt.
export const extractBookmarksForLlm = (nodes: EnhancedBookmark[]): Record<string, string[]> => {
  const bookmarksByFolder: Record<string, string[]> = {};

  const traverse = (node: EnhancedBookmark, path: string[]) => {
    if (node.children) {
      const currentPath = [...path, node.title].join(' > ');
      const bookmarkTitles = node.children.filter(child => child.url).map(child => child.title);
      if (bookmarkTitles.length > 0) {
        bookmarksByFolder[currentPath] = bookmarkTitles;
      }
      node.children.filter(child => !child.url).forEach(subfolder => traverse(subfolder, [...path, node.title]));
    }
  };

  // Start traversal from top-level nodes (e.g., Bookmarks Bar, Other Bookmarks)
  nodes.forEach(node => {
    if (!node.url) { // It's a folder
      traverse(node, []);
    }
  });

  return bookmarksByFolder;
};

// Extracts only bookmark titles (items with URLs) into a flat list for the LLM.
export const extractBookmarks = (nodes: EnhancedBookmark[]): string[] => {
  const bookmarkTitles: string[] = [];
  const traverse = (node: EnhancedBookmark) => {
    if (node.url) {
      bookmarkTitles.push(node.title);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  nodes.forEach(traverse);
  return bookmarkTitles;
};

// Extracts only the folder structure for the LLM's context.
export const extractFolderStructure = (nodes: EnhancedBookmark[]): LlmFolder[] => {
  const buildFolderTree = (nodes: EnhancedBookmark[]): LlmFolder[] => {
    return nodes
      .filter(node => !node.url) // Only consider folders
      .map(node => {
        const folder: LlmFolder = { title: node.title };
        if (node.children && node.children.some(child => !child.url)) {
          folder.children = buildFolderTree(node.children);
        }
        return folder;
      });
  };
  return buildFolderTree(nodes);
};

// Type for the AI-generated tree structure
export type GeneratedNode = {
    id?: string; // Bookmarks will have an id
    title?: string; // Folders will have a title
    children?: GeneratedNode[];
};

// Applies the AI-generated tree structure to Chrome bookmarks.
export const applyNewBookmarkTree = async (tree: GeneratedNode[]): Promise<void> => {
    console.log("Applying new bookmark tree structure:", JSON.stringify(tree, null, 2));

    const topLevelFolderIds: { [key: string]: string } = {
        'Bookmarks bar': '1',
        'Other bookmarks': '2',
        '书签栏': '1', // For Chinese locale
        '其他书签': '2' // For Chinese locale
    };

    const processNode = async (node: GeneratedNode, parentId: string) => {
        // It's a folder
        if (node.title && node.children) {
            try {
                console.log(`Creating folder "${node.title}" inside parent ID ${parentId}`);
                const newFolder = await chrome.bookmarks.create({
                    parentId: parentId,
                    title: node.title,
                });
                console.log(`Successfully created folder "${node.title}" with ID ${newFolder.id}`);
                // Process children of the newly created folder
                for (const child of node.children) {
                    await processNode(child, newFolder.id);
                }
            } catch (error) {
                console.error(`Failed to create folder "${node.title}" under parent ${parentId}:`, error);
            }
        } 
        // It's a bookmark
        else if (node.id) {
            try {
                console.log(`Moving bookmark ID ${node.id} to parent ID ${parentId}`);
                await chrome.bookmarks.move(node.id, { parentId: parentId });
                console.log(`Successfully moved bookmark ID ${node.id}`);
            } catch (error) {
                // It might fail if the bookmark is already in the target folder, which can happen.
                // We can choose to log this as a warning instead of an error.
                console.warn(`Could not move bookmark with id "${node.id}" to parent ${parentId}:`, error);
            }
        }
    };

    // Process each top-level node from the generated tree
    for (const node of tree) {
        if (node.title && node.children) {
            const parentId = topLevelFolderIds[node.title];
            if (parentId) {
                console.log(`Found matching top-level folder: "${node.title}". Processing its children under parent ID ${parentId}.`);
                // This is an existing top-level folder, process its children
                for (const child of node.children) {
                    await processNode(child, parentId);
                }
            } else {
                console.warn(`Generated top-level folder "${node.title}" is not a recognized root. Skipping.`);
            }
        }
    }
    console.log("Finished applying new bookmark tree structure.");
};