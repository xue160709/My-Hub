import React from 'react';
import { WebCombo } from '../types';
import { ItemCard } from './ItemCard';

interface WebComboCardProps {
  combo: WebCombo;
  onEdit: (combo: WebCombo) => void;
  onDelete: (id: string) => void;
}

const WebComboCard: React.FC<WebComboCardProps> = ({ combo, onEdit, onDelete }) => {
  const handleCardClick = () => {
    combo.urls.forEach(url => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  const actions = [
    {
      label: 'Edit',
      icon: 'edit',
      onClick: () => onEdit(combo),
    },
    {
      label: 'Delete',
      icon: 'delete',
      onClick: () => onDelete(combo.id),
    },
  ];

  return (
    <div onClick={handleCardClick} className="cursor-pointer">
        <ItemCard
            href="#"
            title={combo.title}
            hostname={`${combo.urls.length} links`}
            faviconUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72'%3E%3C/path%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72'%3E%3C/path%3E%3C/svg%3E"
            actions={actions}
        />
    </div>
  );
};

export default WebComboCard;
