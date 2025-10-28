import React, { useState, useEffect, useRef } from 'react';
import { EnhancedBookmark } from '../../../types/bookmarks';

// =================================================================================
// Hooks
// =================================================================================

const useClickOutside = (ref: React.RefObject<any>, handler: () => void) => {
    useEffect(() => {
      const listener = (event: MouseEvent | TouchEvent) => {
        if (!ref.current || ref.current.contains(event.target as Node)) {
          return;
        }
        handler();
      };
      document.addEventListener('mousedown', listener);
      document.addEventListener('touchstart', listener);
      return () => {
        document.removeEventListener('mousedown', listener);
        document.removeEventListener('touchstart', listener);
      };
    }, [ref, handler]);
};


// =================================================================================
// Modals
// =================================================================================

const FolderModal: React.FC<{
    mode: 'create' | 'rename';
    folderName?: string;
    onSave: (name: string) => void;
    onClose: () => void;
}> = ({ mode, folderName, onSave, onClose }) => {
    const [name, setName] = useState(folderName || '');

    const handleSave = () => {
        if (name.trim()) {
            onSave(name.trim());
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="card w-full max-w-sm">
                <h3 className="text-lg font-bold mb-6">{mode === 'create' ? 'New Folder' : 'Rename Folder'}</h3>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Folder name"
                    className="w-full mt-1 px-4 py-2 bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <div className="flex justify-end space-x-4 mt-8">
                    <button onClick={onClose} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition">Cancel</button>
                    <button onClick={handleSave} className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition">Save</button>
                </div>
            </div>
        </div>
    );
};

const DeleteConfirmModal: React.FC<{
    folder: EnhancedBookmark;
    onConfirm: (strategy: 'deleteAll' | 'moveContents') => void;
    onClose: () => void;
}> = ({ folder, onConfirm, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="card w-full max-w-md">
                <h3 className="text-lg font-bold mb-2">Delete Folder</h3>
                <p className="text-secondary mb-6">Are you sure you want to delete "{folder.title}"?</p>
                <div className="space-y-4">
                    <button
                        onClick={() => onConfirm('deleteAll')}
                        className="w-full text-left px-5 py-3 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition"
                    >
                        <p className="font-semibold">Delete folder and all its contents</p>
                        <p className="text-sm text-red-500">This will permanently delete {folder.children?.length || 0} items. This cannot be undone.</p>
                    </button>
                    <button
                        onClick={() => onConfirm('moveContents')}
                        className="w-full text-left px-5 py-3 rounded-lg text-main bg-secondary hover:bg-gray-200 transition"
                    >
                        <p className="font-semibold">Delete folder and keep contents</p>
                        <p className="text-sm text-gray-500">The contents will be moved to the Bookmarks Bar.</p>
                    </button>
                </div>
                <div className="flex justify-end mt-8">
                    <button onClick={onClose} className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition">Cancel</button>
                </div>
            </div>
        </div>
    );
};


// =================================================================================
// Main Component & Sub-components
// =================================================================================

interface BookmarkFolderTreeProps {
  nodes: EnhancedBookmark[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  createFolder: (parentId: string, title: string) => Promise<void>;
  renameFolder: (id: string, newTitle: string) => Promise<void>;
  deleteFolder: (id: string, strategy: 'deleteAll' | 'moveContents') => Promise<void>;
  disableContextMenu?: boolean;
}

interface FolderNodeProps {
    node: EnhancedBookmark;
    selectedFolderId: string;
    onSelectFolder: (id: string) => void;
    level: number;
    actions: {
      createFolder: (parentId: string, title: string) => Promise<void>;
      renameFolder: (id: string, newTitle: string) => Promise<void>;
      deleteFolder: (id: string, strategy: 'deleteAll' | 'moveContents') => Promise<void>;
    };
    disableContextMenu?: boolean;
}

const FolderNode: React.FC<FolderNodeProps> = ({ node, selectedFolderId, onSelectFolder, level, actions, disableContextMenu }) => {
  const isSelected = node.id === selectedFolderId;
  const hasChildren = node.children && node.children.some(child => child.url === undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));
  
  const [modal, setModal] = useState<'create' | 'rename' | 'delete' | null>(null);

  const handleCreateFolder = async (name: string) => {
    await actions.createFolder(node.id, name);
  };
  const handleRenameFolder = async (name: string) => {
    await actions.renameFolder(node.id, name);
  };
  const handleDeleteFolder = async (strategy: 'deleteAll' | 'moveContents') => {
    await actions.deleteFolder(node.id, strategy);
    setModal(null);
  };

  return (
    <>
      <div className={`group relative ${menuOpen ? 'z-50' : ''}`}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onSelectFolder(node.id);
          }}
          className={`flex items-center py-2 px-3 rounded-lg text-sm transition-colors ${
            isSelected
              ? 'bg-gray-200 text-main font-semibold'
              : 'text-gray-500 hover:bg-gray-100 hover:text-main'
          }`}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
        >
          <span className="material-symbols-outlined icon-linear mr-3 text-base">
            folder
          </span>
          <span className="truncate">{node.title}</span>
        </a>
        
        {!disableContextMenu && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2" ref={menuRef}>
                <button 
                    className="p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setMenuOpen(!menuOpen)}
                >
                    <span className="material-symbols-outlined icon-linear text-lg">more_horiz</span>
                </button>
                {menuOpen && (
                    <div
                        className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-[1000] border"
                        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onMouseUp={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onContextMenu={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    >
                        <div className="py-1 select-none">
                            <div onClick={() => { setModal('create'); setMenuOpen(false); }} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer">
                                <span className="material-symbols-outlined icon-linear text-lg mr-3">create_new_folder</span>New Folder
                            </div>
                            {node.unmodifiable !== 'managed' && node.parentId !== '0' && (
                                <>
                                    <div onClick={() => { setModal('rename'); setMenuOpen(false); }} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer">
                                        <span className="material-symbols-outlined icon-linear text-lg mr-3">drive_file_rename_outline</span>Rename
                                    </div>
                                    <div onClick={() => { setModal('delete'); setMenuOpen(false); }} className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer">
                                        <span className="material-symbols-outlined icon-linear text-lg mr-3">delete</span>Delete
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}
      </div>
      {hasChildren && (
        <div>
          {node.children &&
            node.children
              .filter(child => child.url === undefined) // Only render folders
              .map(childNode => (
                <FolderNode
                  key={childNode.id}
                  node={childNode}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={onSelectFolder}
                  level={level + 1}
                  actions={actions}
                  disableContextMenu={disableContextMenu}
                />
              ))}
        </div>
      )}
      
      {modal === 'create' && <FolderModal mode="create" onSave={handleCreateFolder} onClose={() => setModal(null)} />}
      {modal === 'rename' && <FolderModal mode="rename" folderName={node.title} onSave={handleRenameFolder} onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteConfirmModal folder={node} onConfirm={handleDeleteFolder} onClose={() => setModal(null)} />}
    </>
  );
};

export const BookmarkFolderTree: React.FC<BookmarkFolderTreeProps> = ({ nodes, selectedFolderId, onSelectFolder, disableContextMenu, ...actions }) => {
  const folders = nodes.filter(node => node.url === undefined);

  return (
    <nav className="space-y-1 pr-4">
      {folders.map(node => (
        <FolderNode 
            key={node.id} 
            node={node} 
            selectedFolderId={selectedFolderId} 
            onSelectFolder={onSelectFolder}
            level={0}
            actions={actions}
            disableContextMenu={disableContextMenu}
        />
      ))}
    </nav>
  );
};
