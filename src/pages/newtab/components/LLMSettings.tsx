import React, { useState, useEffect } from 'react';
import { getLLMSettings, saveLLMSettings, testLLMConnection } from '../../../lib/llmUtils';
import { LLMSettings } from '../../../types/llm';
import { PROVIDERS, ProviderKey } from '../../../data/models';

type GeminiNanoStatus = 'checking' | 'available' | 'unavailable' | 'downloading' | 'downloadable';

const LLMSettings: React.FC = () => {
  const [settings, setSettings] = useState<LLMSettings>({
    selectedProvider: '',
    selectedModel: '',
    apiKey: '',
    customApiUrl: '',
    customModel: '',
    providers: {},
    prioritizeGeminiNano: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCustomProvider, setIsCustomProvider] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [geminiNanoStatus, setGeminiNanoStatus] = useState<GeminiNanoStatus>('checking');

  useEffect(() => {
    const loadedSettings = getLLMSettings();
    setSettings(loadedSettings);
    setIsCustomProvider(loadedSettings.selectedProvider === 'custom');
    setIsCustomModel(loadedSettings.selectedModel === 'custom');
    
    // 如果已选择提供商，从对应配置中加载 API Key
    if (loadedSettings.selectedProvider && loadedSettings.selectedProvider !== 'custom') {
      const providerConfig = loadedSettings.providers[loadedSettings.selectedProvider];
      if (providerConfig) {
        setSettings(prev => ({
          ...prev,
          apiKey: providerConfig.apiKey,
          selectedModel: providerConfig.selectedModel,
          customModel: providerConfig.customModel,
        }));
      }
    }

    // Check for Gemini Nano availability
    const checkGeminiNanoAvailability = async () => {
      let status: GeminiNanoStatus = 'unavailable';
      try {
        if (typeof LanguageModel !== 'undefined' && typeof LanguageModel.availability === 'function') {
          status = await LanguageModel.availability();
        }
      } catch (error) {
        console.error("Error checking Gemini Nano availability:", error);
      }
      
      setGeminiNanoStatus(status);

      // 根据可用性及是否已有偏好决定是否需要更新并持久化
      let nextSettingsToSave: LLMSettings | null = null;
      setSettings(currentSettings => {
        // Only default to 'on' if the setting has never been saved before.
        const rawSettingsData = localStorage.getItem('llm_settings');
        const hasSetNanoPreference = rawSettingsData ? 'prioritizeGeminiNano' in JSON.parse(rawSettingsData) : false;

        if (status === 'available') {
          if (!hasSetNanoPreference && !currentSettings.prioritizeGeminiNano) {
            const next = { ...currentSettings, prioritizeGeminiNano: true } as LLMSettings;
            nextSettingsToSave = next;
            return next;
          }
        } else {
          // If not available, always force it to off.
          if (currentSettings.prioritizeGeminiNano) {
            const next = { ...currentSettings, prioritizeGeminiNano: false } as LLMSettings;
            nextSettingsToSave = next;
            return next;
          }
        }
        return currentSettings;
      });

      if (nextSettingsToSave) {
        // 持久化最新的 Gemini Nano 偏好
        saveLLMSettings(nextSettingsToSave);
      }
    };
    checkGeminiNanoAvailability();
  }, []);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value;
    const isCustom = provider === 'custom';
    setIsCustomProvider(isCustom);
    setIsCustomModel(false);
    
    if (isCustom) {
      setSettings(prev => ({
        ...prev,
        selectedProvider: provider,
        selectedModel: '',
        customModel: '',
        apiKey: '',
        customApiUrl: ''
      }));
    } else {
      const providerConfig = settings.providers[provider];
      setSettings(prev => ({
        ...prev,
        selectedProvider: provider,
        selectedModel: providerConfig?.selectedModel || '',
        customModel: providerConfig?.customModel || '',
        apiKey: providerConfig?.apiKey || '',
        customApiUrl: ''
      }));
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const model = e.target.value;
    const isCustom = model === 'custom';
    setIsCustomModel(isCustom);
    
    setSettings(prev => ({
      ...prev,
      selectedModel: model,
      customModel: isCustom ? '' : ''
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleToggleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setSettings(prev => {
      const next = { ...prev, [name]: checked } as LLMSettings;
      // 立即持久化，确保 localStorage 中的开关状态与 UI 同步
      saveLLMSettings(next);
      return next;
    });
  };

  const handleSave = () => {
    saveLLMSettings(settings);
    alert('设置已保存');
  };

  const handleTest = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    try {
      const result = await testLLMConnection(settings);
      setTestResult({ success: true, message: '连接测试成功！' });
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: `连接测试失败: ${error instanceof Error ? error.message : '未知错误'}` 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getProviderOptions = () => {
    const options = Object.entries(PROVIDERS).map(([key, provider]) => (
      <option key={key} value={key}>
        {provider.name}
      </option>
    ));
    options.push(<option key="custom" value="custom">自定义</option>);
    return options;
  };

  const getModelOptions = () => {
    if (isCustomProvider) {
      return [<option key="custom" value="custom">自定义</option>];
    }
    
    const provider = PROVIDERS[settings.selectedProvider as ProviderKey];
    if (!provider) return [];
    
    const options = provider.models.map(model => (
      <option key={model.value} value={model.value}>
        {model.label}
      </option>
    ));
    options.push(<option key="custom" value="custom">自定义</option>);
    return options;
  };

  const getProviderWebsiteUrl = () => {
    if (isCustomProvider) return null;
    const provider = PROVIDERS[settings.selectedProvider as ProviderKey];
    return provider?.websiteUrl;
  };

  const getProviderName = () => {
    if (isCustomProvider) return '自定义服务商';
    const provider = PROVIDERS[settings.selectedProvider as ProviderKey];
    return provider?.name;
  };

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-bold mb-6">LLM 服务商设置</h2>
      
      {/* Gemini Nano Toggle */}
      <div className="mb-6 pb-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <label htmlFor="prioritizeGeminiNano" className="text-sm font-medium text-gray-700">
            优先使用 Gemini Nano
            <p className="text-xs text-gray-500 mt-1">
              使用设备端 AI，速度更快且无需 API Key。
              <a 
                href="https://developer.chrome.com/docs/ai/prompt-api" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:underline ml-1"
              >
                (硬件要求)
              </a>
            </p>
          </label>
          {/* 开关样式与 GeneralSettings 保持一致；不可用时允许关闭但阻止开启 */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              name="prioritizeGeminiNano"
              id="prioritizeGeminiNano"
              checked={settings.prioritizeGeminiNano}
              onChange={(e) => {
                if (e.target.checked && geminiNanoStatus !== 'available') {
                  // 不可用状态下阻止开启
                  return;
                }
                handleToggleChange(e);
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-black"></div>
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          状态: <span className={`font-medium ${geminiNanoStatus === 'available' ? 'text-green-600' : 'text-gray-600'}`}>{geminiNanoStatus}</span>
        </p>
      </div>

      {/* Provider Selection */}
      <div className="mb-6">
        <label htmlFor="provider" className="block text-sm font-medium text-gray-700 mb-2">
          服务商
        </label>
        <select
          id="provider"
          value={settings.selectedProvider}
          onChange={handleProviderChange}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black sm:text-sm"
        >
          <option value="">请选择服务商</option>
          {getProviderOptions()}
        </select>
      </div>

      {/* Custom API URL */}
      {isCustomProvider && (
        <div className="mb-6">
          <label htmlFor="customApiUrl" className="block text-sm font-medium text-gray-700 mb-2">
            API URL
          </label>
          <input
            type="text"
            id="customApiUrl"
            name="customApiUrl"
            value={settings.customApiUrl || ''}
            onChange={handleInputChange}
            placeholder="https://api.example.com/v1/chat/completions"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black sm:text-sm"
          />
        </div>
      )}

      {/* Model Selection */}
      {settings.selectedProvider && (
        <div className="mb-6">
          <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
            模型
          </label>
          <select
            id="model"
            value={settings.selectedModel}
            onChange={handleModelChange}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black sm:text-sm"
          >
            <option value="">请选择模型</option>
            {getModelOptions()}
          </select>
        </div>
      )}

      {/* Custom Model */}
      {isCustomModel && (
        <div className="mb-6">
          <label htmlFor="customModel" className="block text-sm font-medium text-gray-700 mb-2">
            自定义模型
          </label>
          <input
            type="text"
            id="customModel"
            name="customModel"
            value={settings.customModel || ''}
            onChange={handleInputChange}
            placeholder="gpt-4, claude-3-opus, 等"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black sm:text-sm"
          />
        </div>
      )}

      {/* API Key */}
      {settings.selectedProvider && (
        <div className="mb-6">
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              id="apiKey"
              name="apiKey"
              value={settings.apiKey}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
            >
              <span className="material-symbols-outlined icon-linear">
                {showApiKey ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {!isCustomProvider && getProviderWebsiteUrl() && (
            <p className="mt-2 text-xs text-gray-500">
              从{' '}
              <a
                href={getProviderWebsiteUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {getProviderName()}官网
              </a>{' '}
              获取您的 API 密钥。
            </p>
          )}
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className={`mb-6 p-3 rounded-md ${testResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {testResult.message}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-auto">
        <button
          onClick={handleTest}
          disabled={!settings.selectedProvider || !settings.apiKey || isLoading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '测试中...' : '测试连接'}
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium text-white bg-black border border-transparent rounded-full hover:bg-gray-800"
        >
          保存
        </button>
      </div>
    </div>
  );
};

export default LLMSettings;
