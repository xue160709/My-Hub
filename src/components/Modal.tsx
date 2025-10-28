import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  widthClass?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, widthClass = 'max-w-md' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className={`bg-white rounded-lg p-8 shadow-xl w-full ${widthClass}`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">{title}</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
                <span className="material-symbols-outlined">close</span>
            </button>
        </div>
        {children}
      </div>
    </div>
  );
};
