import React, { useState, useEffect, useRef } from 'react';
import { exportData, importData } from '../../../lib/dataSync';

const GeneralSettings: React.FC = () => {
  const [autoSuggest, setAutoSuggest] = useState<boolean>(false);

  useEffect(() => {
    const savedSetting = localStorage.getItem('autoSuggestBookmarkInfo');
    if (savedSetting !== null) {
      setAutoSuggest(JSON.parse(savedSetting));
    }
  }, []);

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setAutoSuggest(newValue);
    localStorage.setItem('autoSuggestBookmarkInfo', JSON.stringify(newValue));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    await exportData();
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importData(file);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">通用设置</h2>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
          <div>
            <h3 className="font-semibold">自动建议标签和文件夹</h3>
            <p className="text-sm text-gray-500">添加书签时，使用 AI 自动建议标签和最合适的文件夹。</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={autoSuggest}
              onChange={handleToggle}
              className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-black"></div>
          </label>
        </div>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4">数据管理</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
          <div>
            <h3 className="font-semibold">导出数据</h3>
            <p className="text-sm text-gray-500">将您的书签、标签和网页组合导出为 JSON 文件。</p>
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg text-white bg-black hover:bg-gray-800 transition"
          >
            导出
          </button>
        </div>
        <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
          <div>
            <h3 className="font-semibold">导入数据</h3>
            <p className="text-sm text-gray-500">从 JSON 文件导入书签、标签和网页组合。</p>
          </div>
          <button
            onClick={handleImport}
            className="px-4 py-2 rounded-lg text-white bg-black hover:bg-gray-800 transition"
          >
            导入
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="application/json"
          />
        </div>
      </div>

      <p className="text-gray-500 mt-8">更多功能正在开发中。</p>
    </div>
  );
};

export default GeneralSettings;
