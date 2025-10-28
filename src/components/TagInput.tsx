import React, { useState, KeyboardEvent } from 'react';

interface TagInputProps {
  tags: string[];
  setTags: (tags: string[]) => void;
}

const TagInput: React.FC<TagInputProps> = ({ tags, setTags }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const newTag = inputValue.trim();
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="bg-secondary rounded-lg">
      <div className="flex flex-wrap gap-2 p-3">
        {tags.map(tag => (
          <span key={tag} className="bg-white text-main text-sm font-medium px-3 py-1 rounded-full flex items-center">
            {tag}
            <button onClick={() => removeTag(tag)} className="ml-2 text-gray-400 hover:text-gray-600 font-bold">
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add tags (press Enter or comma)"
        className="w-full px-4 py-3 bg-secondary rounded-lg focus:outline-none"
      />
    </div>
  );
};

export default TagInput;
