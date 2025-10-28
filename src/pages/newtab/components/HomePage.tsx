import React, { useState, useRef, useEffect } from 'react';
import { RecommendationItem, WebCombo } from '../types';
import { timeAgo } from '../utils';
import { ItemCard } from './ItemCard';
import { Modal } from '../../../components/Modal';
import AddBookmarkForm from './AddBookmarkForm';
import WebComboForm from './WebComboForm';
import WebComboCard from './WebComboCard';
import { v4 as uuidv4 } from 'uuid';
import UnifiedSearchBar from '../../../components/UnifiedSearchBar';
import { useGlobalSearch } from '../../../hooks/useGlobalSearch';
import { SearchResultItem } from '../../../types/search';


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

interface HomePageProps {
  recommendations: RecommendationItem[];
  timeRange: string;
}

export const HomePage: React.FC<HomePageProps> = ({ recommendations, timeRange }) => {
  const [noMoreDisplayed, setNoMoreDisplayed] = useState<string[]>(() => {
    const stored = localStorage.getItem('noMoreDisplayed');
    return stored ? JSON.parse(stored) : [];
  });
  const [searchTerm, setSearchTerm] = useState('');
  const { results: searchResults, loading: searchLoading } = useGlobalSearch(searchTerm);

  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [itemToAddBookmark, setItemToAddBookmark] = useState<RecommendationItem | SearchResultItem | null>(null);
  const [clipboardItems, setClipboardItems] = useState<RecommendationItem[]>([]);

  // Web Combo state
  const [webCombos, setWebCombos] = useState<WebCombo[]>(() => {
    const stored = localStorage.getItem('webCombos');
    return stored ? JSON.parse(stored) : [];
  });
  const [isComboModalOpen, setIsComboModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<WebCombo | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(moreMenuRef, () => setShowMoreMenu(false));

  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = text.match(urlRegex);

        if (urls) {
          const newItems: RecommendationItem[] = urls.map(url => ({
            url: url,
            title: url.length > 20 ? url.substring(0, 20) + '...' : url,
            favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`,
            lastVisitTime: Date.now(),
            visits: [],
            visitsInWindow: 1,
            isBookmark: false,
            tags: [],
          }));
          setClipboardItems(newItems);
        }
        // On success, remove the listener to avoid re-checking
        window.removeEventListener('focus', checkClipboard);
      } catch (err) {
        if (err instanceof Error && err.name === 'NotAllowedError') {
          console.log('Waiting for document focus to read clipboard.');
        } else {
          console.error('Failed to read clipboard contents: ', err);
        }
      }
    };

    window.addEventListener('focus', checkClipboard);
    checkClipboard(); // Initial attempt

    return () => {
      window.removeEventListener('focus', checkClipboard);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('webCombos', JSON.stringify(webCombos));
  }, [webCombos]);

  const handleAddToNoMoreDisplayed = (url: string) => {
    const updatedList = [...noMoreDisplayed, url];
    setNoMoreDisplayed(updatedList);
    localStorage.setItem('noMoreDisplayed', JSON.stringify(updatedList));
  };

  const handleOpenBookmarkModal = (item: RecommendationItem | SearchResultItem) => {
    setItemToAddBookmark(item);
    setIsBookmarkModalOpen(true);
  };
  
  const handleSaveCombo = (comboData: Omit<WebCombo, 'id'> & { id?: string }) => {
    if (comboData.id) { // Editing existing combo
      setWebCombos(webCombos.map(c => c.id === comboData.id ? { ...c, ...comboData } : c));
    } else { // Creating new combo
      setWebCombos([...webCombos, { ...comboData, id: uuidv4() }]);
    }
    setIsComboModalOpen(false);
    setEditingCombo(null);
  };

  const handleDeleteCombo = (id: string) => {
    if (window.confirm("Are you sure you want to delete this web combo?")) {
        setWebCombos(webCombos.filter(c => c.id !== id));
    }
  };

  const handleOpenCreateComboModal = () => {
    setEditingCombo(null);
    setIsComboModalOpen(true);
    setShowMoreMenu(false);
  };

  const handleOpenEditComboModal = (combo: WebCombo) => {
    setEditingCombo(combo);
    setIsComboModalOpen(true);
  };

  const itemActions = (item: RecommendationItem | SearchResultItem) => {
    const actions = [];
    
    const isBookmark = 'type' in item ? item.type === 'bookmark' : item.isBookmark;

    if (!isBookmark) {
      actions.push({
        label: 'Add Bookmark',
        icon: 'bookmark_add',
        onClick: () => handleOpenBookmarkModal(item),
      });
    }
    
    actions.push({
      label: 'Don\'t show again',
      icon: 'visibility_off',
      onClick: () => handleAddToNoMoreDisplayed(item.url!),
    });
    
    return actions;
  };

  const filteredRecommendations = recommendations.filter(item => !noMoreDisplayed.includes(item.url));

  const allItems = [...clipboardItems, ...filteredRecommendations];

  return (
    <div className="p-10 relative">
      <div className="absolute top-10 right-10 flex items-center space-x-4">
          <div className="w-64">
            <UnifiedSearchBar 
              mode="global"
              value={searchTerm}
              onChange={setSearchTerm}
              loading={searchLoading}
              placeholder="Search history and bookmarks..."
            />
          </div>
          <div className="relative" ref={moreMenuRef}>
              <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="p-2 rounded-full hover:bg-gray-200 transition">
                  <span className="material-symbols-outlined icon-linear text-lg">more_vert</span>
              </button>
              {showMoreMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
                      <div className="py-1">
                          <div
                              onClick={handleOpenCreateComboModal}
                              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                          >
                              创建网页Combo
                          </div>
                      </div>
                  </div>
              )}
          </div>
      </div>

      {searchTerm ? (
        <div className="mt-12">
          <h2 className="text-xl font-bold text-main mb-6">Search Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {searchResults.map(item => (
              <ItemCard
                key={item.type === 'history' ? item.url! : item.id}
                href={item.url!}
                title={item.title!}
                hostname={item.url ? new URL(item.url).hostname : ''}
                faviconUrl={`https://www.google.com/s2/favicons?domain=${item.url ? new URL(item.url).hostname : ''}&sz=32`}
                visitCount={'visitCount' in item ? item.visitCount : undefined}
                timeLabel={timeAgo((item.type === 'history' ? item.lastVisitTime : item.dateAdded) || 0)}
                tags={'tags' in item ? (item.tags as string[]) : undefined}
                actions={itemActions(item)}
                type={item.type}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-10">
            <div className="flex items-center mb-2">
              <span className="material-symbols-outlined text-main mr-3 icon-linear">schedule</span>
              <h2 className="text-xl font-bold text-main">Moments in History</h2>
            </div>
            <p className="text-secondary ml-9">
              In the past 14 days, you have frequently visited these websites during the current time period
              <span className="block font-mono text-xs mt-1">{timeRange}</span>
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {allItems.map(item => (
              <ItemCard
                key={item.url}
                href={item.url}
                title={item.title}
                hostname={new URL(item.url).hostname}
                faviconUrl={item.favicon}
                visitCount={item.visitsInWindow}
                timeLabel={clipboardItems.some(ci => ci.url === item.url) ? 'From Clipboard' : timeAgo(item.lastVisitTime)}
                tags={item.tags}
                actions={itemActions(item)}
              />
            ))}
          </div>
          
          {webCombos.length > 0 && (
            <div className="mt-12">
                <div className="mb-10">
                    <div className="flex items-center mb-2">
                      <span className="material-symbols-outlined text-main mr-3 icon-linear">collections_bookmark</span>
                      <h2 className="text-xl font-bold text-main">Web Combos</h2>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                    {webCombos.map(combo => (
                        <WebComboCard
                            key={combo.id}
                            combo={combo}
                            onEdit={handleOpenEditComboModal}
                            onDelete={handleDeleteCombo}
                        />
                    ))}
                </div>
            </div>
          )}
        </>
      )}

      <Modal isOpen={isBookmarkModalOpen} onClose={() => setIsBookmarkModalOpen(false)} title="Add Bookmark">

        {itemToAddBookmark && (
          <AddBookmarkForm
            initialUrl={itemToAddBookmark.url!}
            initialTitle={itemToAddBookmark.title!}
            onSuccess={() => {
              setIsBookmarkModalOpen(false);
            }}
          />
        )}
      </Modal>

      <Modal isOpen={isComboModalOpen} onClose={() => setIsComboModalOpen(false)} title={editingCombo ? "Edit Web Combo" : "Create Web Combo"}>
        <WebComboForm
            combo={editingCombo}
            onSave={handleSaveCombo}
            onCancel={() => {
                setIsComboModalOpen(false);
                setEditingCombo(null);
            }}
        />
      </Modal>
    </div>
  )
};
