import React, { useState, useRef, useEffect } from 'react';

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

interface Action {
  label: string;
  icon: string;
  onClick: () => void;
}

interface ItemCardProps {
  // 核心数据
  href: string;
  title: string;
  hostname: string;
  faviconUrl: string;
  type?: 'history' | 'bookmark';

  // 扩展元数据 (替代旧的 badges)
  timeLabel?: string;      // 格式化后的时间字符串，如 "2小时前"
  visitCount?: number;     // 访问次数
  device?: string;         // 设备名称，如 "Laptop"

  // 功能模块
  tags?: string[];         // 书签标签
  actions?: Action[];      // 操作菜单项

  // 交互状态
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  href,
  title,
  hostname,
  faviconUrl,
  tags,
  timeLabel,
  visitCount,
  device,
  actions,
  isMultiSelectMode = false,
  isSelected = false,
  onSelect,
}) => {
  const [showActions, setShowActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useClickOutside(dropdownRef, () => setShowActions(false));

  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't navigate if clicking on an interactive element
    if (
        dropdownRef.current?.contains(e.target as Node) ||
        (e.target as HTMLElement).closest('button')
    ) {
        return;
    }
    
    if (isMultiSelectMode) {
      onSelect?.();
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  const metadataElements: React.JSX.Element[] = [];
  if (timeLabel) {
    metadataElements.push(
      <div key="time" className="flex items-center">
        {/* <span className="material-symbols-outlined icon-linear text-sm mr-1.5">schedule</span> */}
        <span>{timeLabel}</span>
      </div>
    );
  }
  if (visitCount !== undefined) {
    metadataElements.push(<span key="visits">{`${visitCount} days`}</span>);
  }
  if (device) {
    metadataElements.push(<span key="device">{device}</span>);
  }

  const actionMenu = actions && (
    <div className="absolute top-2 right-2 z-10">
      <button
        onClick={e => {
          e.stopPropagation();
          setShowActions(!showActions);
        }}
        className={`p-2 rounded-full transition-opacity ${isMultiSelectMode ? 'opacity-0' : 'opacity-0 group-hover:opacity-100 hover:bg-gray-100'}`}
        disabled={isMultiSelectMode}
      >
        <span className="material-symbols-outlined icon-linear text-lg">more_vert</span>
      </button>
      {showActions && (
        <div ref={dropdownRef} className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
          <div className="py-1">
            {actions.map(action => (
              <div
                key={action.label}
                onClick={e => {
                  e.stopPropagation();
                  action.onClick();
                  setShowActions(false);
                }}
                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <span className="material-symbols-outlined icon-linear text-lg mr-3">{action.icon}</span>
                {action.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      onClick={handleWrapperClick}
      className={`card relative flex flex-col p-4 no-underline group transition-all duration-200 min-h-[120px] ${
        isMultiSelectMode ? 'cursor-pointer' : 'hover:!shadow-xl cursor-pointer'
      } ${isSelected ? 'bg-blue-50 border-blue-200 shadow-inner' : ''}`}
      style={{ borderRadius: '20px' }}
    >
      {isMultiSelectMode && (
        <div className="absolute top-4 left-4 z-10" onClick={e => e.stopPropagation()}>
           <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="h-5 w-5 rounded border-gray-300 text-black focus:ring-black cursor-pointer accent-black"
          />
        </div>
      )}

      {/* -- Header -- */}
      <div className={`flex items-start ${isMultiSelectMode ? 'pl-8' : ''}`}>
        <img alt={`${title} favicon`} className="w-6 h-6 mr-3 mt-1 flex-shrink-0 avatar-flat" src={faviconUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-main text-sm leading-tight line-clamp-2" title={title}>
            {title}
          </h3>
          <p className="text-xs text-secondary truncate mt-1">{hostname}</p>
        </div>
      </div>
      
      {actionMenu}

      {/* -- Tags -- */}
      {tags && tags.length > 0 && (
          <div className={`flex items-center flex-wrap gap-2 text-xs mt-3 ${isMultiSelectMode ? 'pl-8' : ''}`}>
              {tags.map(tag => (
                  <span key={tag} className="px-2.5 py-0.5 bg-black text-white rounded-full text-xs">
                      {tag}
                  </span>
              ))}
          </div>
      )}

      {/* -- Footer (Metadata) -- */}
      {metadataElements.length > 0 && (
        <div className={`flex items-center flex-wrap gap-y-1 text-xs text-secondary mt-auto pt-3 ${isMultiSelectMode ? 'pl-8' : ''}`}>
          {metadataElements.reduce<React.ReactNode[]>((acc, el, i) => {
            if (i > 0) {
              acc.push(<span key={`sep-${el.key}`} className="mx-1.5">·</span>);
            }
            acc.push(el);
            return acc;
          }, [])}
        </div>
      )}
    </div>
  );
};
