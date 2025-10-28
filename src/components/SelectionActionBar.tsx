import React from 'react';

export interface ActionItem {
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

interface SelectionActionBarProps {
  selectionCount: number;
  actions: ActionItem[];
  onCancel: () => void;
}

export function SelectionActionBar({
  selectionCount,
  actions,
  onCancel,
}: SelectionActionBarProps) {
  if (selectionCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white shadow-2xl rounded-full px-6 py-4 flex items-center space-x-6 z-50">
      <span className="text-sm font-medium text-gray-800">
        {selectionCount} item{selectionCount > 1 ? 's' : ''} selected
      </span>
      <div className="h-6 border-l border-gray-200"></div>
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={action.onClick}
          className={`text-sm font-semibold transition-colors ${action.className || 'text-gray-600 hover:text-gray-800'} ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
      <button
        onClick={onCancel}
        className="text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
