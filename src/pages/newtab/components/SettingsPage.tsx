import React, { useState } from 'react';
import GeneralSettings from './GeneralSettings';
import LLMSettings from './LLMSettings';

interface SettingsPageProps {
  onClose: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onClose }) => {
  const [activeMenu, setActiveMenu] = useState('LLM');

  return (
    <div className="flex h-[60vh]">
      <nav className="w-48 border-r border-gray-200 pr-6">
        <ul>
          <li>
            <a
              href="#"
              onClick={() => setActiveMenu('General')}
              className={`flex items-center py-2 px-4 rounded-full text-sm ${
                activeMenu === 'General'
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-black'
              }`}
            >
              通用
            </a>
          </li>
          <li className='mt-2'>
            <a
              href="#"
              onClick={() => setActiveMenu('LLM')}
              className={`flex items-center py-2 px-4 rounded-full text-sm ${
                activeMenu === 'LLM'
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-black'
              }`}
            >
              LLM
            </a>
          </li>
        </ul>
      </nav>
      <main className="flex-1 pl-6 flex flex-col">
        {activeMenu === 'General' && <GeneralSettings />}
        {activeMenu === 'LLM' && <LLMSettings />}
      </main>
    </div>
  );
};

export default SettingsPage;
