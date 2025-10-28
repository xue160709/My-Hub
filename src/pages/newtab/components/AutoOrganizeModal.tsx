import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '../../../components/Modal';
import { EnhancedBookmark } from '../../../types/bookmarks';
import { BookmarkFolderTree } from './BookmarkFolderTree';
import { sendMessage } from '../../../services/llmService';
import { getBookmarkOrganizationSystemPrompt } from '../../../lib/bookmarkOrganizationPrompts';
import { extractBookmarks, extractFolderStructure, applyNewBookmarkTree, GeneratedNode, extractBookmarksForLlm } from '../utils';
import { jsonrepair } from 'jsonrepair';

let tempIdCounter = 0;
// This function converts the LLM's raw tree to a display-friendly, editable tree
const mapRawTreeToDisplayTree = (nodes: GeneratedNode[], parentId: string, bookmarksMap: Map<string, EnhancedBookmark>): EnhancedBookmark[] => {
    return nodes.map((node, index) => {
        if (node.id) { // It's a bookmark
            return bookmarksMap.get(node.id) || { id: node.id, title: 'Unknown Bookmark', url: '#', parentId, index, syncing: false };
        }
        if (node.title) { // It's a folder
            const tempId = `temp-folder-${++tempIdCounter}`;
            return {
                id: tempId,
                title: node.title,
                parentId,
                index,
                children: node.children ? mapRawTreeToDisplayTree(node.children, tempId, bookmarksMap) : [],
                syncing: false,
            };
        }
        return null;
    }).filter(Boolean) as EnhancedBookmark[];
};

// This function converts the edited tree back to the format for the Chrome API
const mapDisplayTreeToRawTree = (nodes: EnhancedBookmark[]): GeneratedNode[] => {
    return nodes.map(node => {
        if (node.url) { // It's a bookmark, return its ID
             return { id: node.id };
        }
        // It's a folder, return title and children
        return {
            title: node.title,
            children: node.children ? mapDisplayTreeToRawTree(node.children) : []
        };
    });
};


interface AutoOrganizeModalProps {
  isOpen: boolean;
  onClose: (refresh?: boolean) => void;
  bookmarks: EnhancedBookmark[];
  createFolder: (parentId: string, title: string) => Promise<void>;
  renameFolder: (id: string, newTitle: string) => Promise<void>;
  deleteFolder: (id: string, strategy: 'deleteAll' | 'moveContents') => Promise<void>;
  isBulkUpdating: boolean;
  applyBookmarkOrganization: (tree: GeneratedNode[]) => Promise<void>;
}

export const AutoOrganizeModal: React.FC<AutoOrganizeModalProps> = ({ 
    isOpen, 
    onClose, 
    bookmarks,
    isBulkUpdating,
    applyBookmarkOrganization,
}) => {
  const [editableGeneratedTree, setEditableGeneratedTree] = useState<EnhancedBookmark[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const finalIsLoading = isLoading || isBulkUpdating;

  const handleGenerate = async () => {
    console.log('handleGenerate: Starting...');
    setIsLoading(true);
    setError(null);
    setEditableGeneratedTree(null);

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const bookmarksToOrganize = extractBookmarksForLlm(bookmarks);
    console.log(`handleGenerate: Found bookmarks to organize.`);

    if (Object.keys(bookmarksToOrganize).length === 0) {
        setError("No bookmarks to organize.");
        setIsLoading(false);
        return;
    }
    
    const folderStructure = extractFolderStructure(bookmarks);
    console.log('handleGenerate: Extracted existing folder structure:', folderStructure);

    const systemPrompt = getBookmarkOrganizationSystemPrompt(JSON.stringify(folderStructure, null, 2));
    const userPrompt = `Here is the list of my bookmarks. Please organize them for me:\n\n${JSON.stringify(bookmarksToOrganize, null, 2)}`;
    
    console.log('handleGenerate: Sending prompts to LLM:', "systemPrompt", systemPrompt, "userPrompt", userPrompt);

    try {
        await sendMessage(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            {
                onUpdate: () => {}, // Not used in non-streaming mode
                onFinish: (fullResponse) => {
                    console.log('handleGenerate: Received raw response from LLM:', fullResponse);
                    if (!fullResponse) {
                        setError("Received an empty response from the AI.");
                        setIsLoading(false);
                        return;
                    }
                    try {
                        const startIndex = fullResponse.indexOf('[');
                        const endIndex = fullResponse.lastIndexOf(']');
                        let jsonString = fullResponse;

                        if (startIndex !== -1 && endIndex !== -1) {
                            jsonString = fullResponse.substring(startIndex, endIndex + 1);
                        } else {
                            console.warn("Could not find a clear JSON array, attempting to repair the whole string.");
                        }
                        
                        console.log('handleGenerate: Attempting to repair and parse JSON.');
                        const repairedJson = jsonrepair(jsonString);
                        const organizedTree = JSON.parse(repairedJson) as GeneratedNode[];
                        console.log('handleGenerate: Successfully parsed generated tree:', organizedTree);

                        // Merge top-level folders that don't exist into "Bookmarks Bar"
                        const existingTopLevelFolders = folderStructure.map(f => f.title);
                        existingTopLevelFolders.push('Bookmarks bar', 'Other bookmarks', '书签栏', '其他书签');

                        const bookmarksBarNode: GeneratedNode = { title: 'Bookmarks bar', children: [] };
                        const finalTree: GeneratedNode[] = [];
                        let foundBookmarksBar = false;
                        let otherBookmarksNode: GeneratedNode | null = null;

                        for (const node of organizedTree) {
                            if (node.title && existingTopLevelFolders.includes(node.title)) {
                                if (node.title === 'Bookmarks bar' || node.title === '书签栏') {
                                    bookmarksBarNode.children!.push(...(node.children || []));
                                    if (!foundBookmarksBar) {
                                        finalTree.push(bookmarksBarNode);
                                        foundBookmarksBar = true;
                                    }
                                } else if (node.title === 'Other bookmarks' || node.title === '其他书签') {
                                    // Handle 'Other Bookmarks' separately
                                    if (!otherBookmarksNode) {
                                        otherBookmarksNode = { title: node.title, children: [] };
                                        finalTree.push(otherBookmarksNode);
                                    }
                                    otherBookmarksNode.children!.push(...(node.children || []));
                                } else {
                                    finalTree.push(node);
                                }
                            } else if(node.children) {
                                bookmarksBarNode.children!.push(...node.children);
                                if (!foundBookmarksBar) {
                                    finalTree.push(bookmarksBarNode);
                                    foundBookmarksBar = true;
                                }
                            }
                        }
                        if (!foundBookmarksBar && bookmarksBarNode.children!.length > 0) {
                            finalTree.push(bookmarksBarNode);
                        }


                        const bookmarksMap = new Map<string, EnhancedBookmark>();
                        const flattenAndMap = (nodes: EnhancedBookmark[]) => {
                          for (const node of nodes) {
                            if (node.url) bookmarksMap.set(node.id, node);
                            if (node.children) flattenAndMap(node.children);
                          }
                        };
                        flattenAndMap(bookmarks);

                        tempIdCounter = 0; // Reset counter for unique IDs
                        setEditableGeneratedTree(mapRawTreeToDisplayTree(finalTree, '0', bookmarksMap));
                    } catch (e) {
                        console.error("handleGenerate: Failed to parse LLM response.", e, "\nRaw response:", fullResponse);
                        setError("Failed to parse the structure from the AI. Please try again.");
                    } finally {
                        setIsLoading(false);
                    }
                },
                onError: (err) => {
                    console.error("handleGenerate: LLM Error callback:", err);
                    setError(err.message || "An unknown error occurred.");
                    setIsLoading(false);
                },
            },
            abortControllerRef.current.signal,
            { stream: false }
        );
    } catch (err) {
        if ((err as Error).name !== 'AbortError') {
            console.error("handleGenerate: Failed to send message:", err);
            setError((err as Error).message || "An unknown error occurred.");
            setIsLoading(false);
        }
    }
  };
  
  const handleApplyChanges = async () => {
    if (!editableGeneratedTree) return;
    console.log('handleApplyChanges: Starting to apply new structure...', JSON.stringify(editableGeneratedTree, null, 2));
    setIsLoading(true);
    setError(null);
    try {
        const rawTreeToApply = mapDisplayTreeToRawTree(editableGeneratedTree);
        console.log('handleApplyChanges: Mapped raw tree to apply:', JSON.stringify(rawTreeToApply, null, 2));
        await applyBookmarkOrganization(rawTreeToApply);
        console.log('handleApplyChanges: Successfully applied new structure.');
        onClose(); // No need to pass true, refresh is handled by the hook
    } catch (error) {
        console.error("handleApplyChanges: Failed to apply new bookmark tree:", error);
        setError("An error occurred while applying the new structure.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleClose = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
      onClose();
  }

  const handleInMemoryRename = async (id: string, newTitle: string) => {
    setEditableGeneratedTree(prevTree => {
        if (!prevTree) return null;
        const newTree = JSON.parse(JSON.stringify(prevTree)); // Deep copy
        const rename = (nodes: EnhancedBookmark[]): boolean => {
            for (const node of nodes) {
                if (node.id === id) {
                    node.title = newTitle;
                    return true;
                }
                if (node.children && rename(node.children)) return true;
            }
            return false;
        };
        rename(newTree);
        return newTree;
    });
  };

  const handleInMemoryDelete = async (id: string) => {
    setEditableGeneratedTree(prevTree => {
        if (!prevTree) return null;
        const deleteNode = (nodes: EnhancedBookmark[], targetId: string): EnhancedBookmark[] => {
            return nodes.filter(node => {
                if (node.id === targetId) return false;
                if (node.children) {
                    node.children = deleteNode(node.children, targetId);
                }
                return true;
            });
        };
        return deleteNode(JSON.parse(JSON.stringify(prevTree)), id);
    });
  };

  const handleInMemoryCreate = async (parentId: string, title: string) => {
    setEditableGeneratedTree(prevTree => {
        if (!prevTree) return null;
        const newTree = JSON.parse(JSON.stringify(prevTree)); // Deep copy
        const newNode: EnhancedBookmark = {
            id: `temp-folder-${++tempIdCounter}`,
            title,
            parentId,
            index: 0,
            children: [],
            syncing: false
        };
        const add = (nodes: EnhancedBookmark[]): boolean => {
            for (const node of nodes) {
                if (node.id === parentId) {
                    node.children = node.children ? [...node.children, newNode] : [newNode];
                    node.children.forEach((child, index) => child.index = index);
                    return true;
                }
                if (node.children && add(node.children)) return true;
            }
            return false;
        };
        add(newTree);
        return newTree;
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="AI 自动整理文件夹" widthClass="max-w-4xl">
        {error && <div className="mb-4 text-red-600 p-3 bg-red-50 rounded-lg text-sm">{error}</div>}
        <div className="flex space-x-6 h-[60vh]">
            <div className="w-1/2 h-full overflow-y-auto border rounded-lg p-4">
                <h4 className="text-lg font-semibold mb-2">当前结构</h4>
                <BookmarkFolderTree nodes={bookmarks} selectedFolderId="" onSelectFolder={() => {}} disableContextMenu={true} createFolder={async () => {}} renameFolder={async () => {}} deleteFolder={async () => {}} />
            </div>
            <div className="w-1/2 h-full overflow-y-auto border rounded-lg p-4 bg-gray-50">
                <h4 className="text-lg font-semibold mb-2">生成结构</h4>
                {finalIsLoading && !editableGeneratedTree && <div className="flex items-center justify-center h-full text-gray-500"><p>AI 正在生成中...</p></div>}
                {editableGeneratedTree ? (
                     <BookmarkFolderTree nodes={editableGeneratedTree} selectedFolderId="" onSelectFolder={() => {}} disableContextMenu={false} createFolder={handleInMemoryCreate} renameFolder={handleInMemoryRename} deleteFolder={handleInMemoryDelete} />
                ) : (
                    !finalIsLoading && <div className="flex items-center justify-center h-full text-gray-500"><p>点击下方按钮开始生成...</p></div>
                )}
            </div>
        </div>
        <div className="flex justify-end space-x-4 mt-6">
            <button onClick={handleClose} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition" disabled={finalIsLoading}>取消</button>
            {editableGeneratedTree ? (
                <>
                    <button onClick={handleGenerate} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition" disabled={finalIsLoading}>{finalIsLoading ? '生成中...' : '重新生成'}</button>
                    <button onClick={handleApplyChanges} className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition" disabled={finalIsLoading}>{finalIsLoading ? '应用中...' : '确定'}</button>
                </>
            ) : (
                <button onClick={handleGenerate} className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition" disabled={finalIsLoading}>{finalIsLoading ? '生成中...' : 'AI 自动整理'}</button>
            )}
        </div>
    </Modal>
  );
};
