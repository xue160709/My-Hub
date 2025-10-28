import React, { useState, useEffect } from 'react';
import { WebCombo } from '../types';

interface WebComboFormProps {
  combo?: WebCombo | null;
  onSave: (combo: Omit<WebCombo, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}

const WebComboForm: React.FC<WebComboFormProps> = ({ combo, onSave, onCancel }) => {
  const [title, setTitle] = useState('');
  const [urls, setUrls] = useState(['']);

  useEffect(() => {
    if (combo) {
      setTitle(combo.title);
      setUrls(combo.urls.length > 0 ? combo.urls : ['']);
    }
  }, [combo]);

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const addUrlInput = () => {
    setUrls([...urls, '']);
  };

  const removeUrlInput = (index: number) => {
    const newUrls = urls.filter((_, i) => i !== index);
    setUrls(newUrls);
  };

  const handleSave = () => {
    const comboToSave = {
      title,
      urls: urls.filter(url => url.trim() !== ''),
    };
    if (combo && combo.id) {
        onSave({ ...comboToSave, id: combo.id });
    } else {
        onSave(comboToSave);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="combo-title" className="block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          type="text"
          id="combo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full px-4 py-2 bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="Enter combo title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">URLs</label>
        <div className="space-y-2 mt-1">
          {urls.map((url, index) => (
            <div key={index} className="flex items-center space-x-2">
              <input
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(index, e.target.value)}
                className="block w-full px-4 py-2 bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                placeholder="https://example.com"
              />
              <button
                onClick={() => removeUrlInput(index)}
                className="p-2 rounded-full hover:bg-gray-200 transition"
                disabled={urls.length === 1}
              >
                <span className="material-symbols-outlined icon-linear text-lg">delete</span>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addUrlInput}
          className="mt-2 flex items-center text-sm text-gray-600 hover:text-black"
        >
          <span className="material-symbols-outlined icon-linear text-lg mr-1">add</span>
          Add URL
        </button>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-full text-main bg-secondary hover:bg-gray-200 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-5 py-2 rounded-full text-white bg-black hover:bg-gray-800 transition"
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default WebComboForm;
