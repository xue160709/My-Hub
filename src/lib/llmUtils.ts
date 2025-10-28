import { LLMSettings, ProviderConfig } from '../types/llm';
import { PROVIDERS, ProviderKey } from '../data/models';

const SETTINGS_KEY = 'llm_settings';

// 初始化默认设置
function getDefaultSettings(): LLMSettings {
  const providers: Record<string, ProviderConfig> = {};
  
  // 从 PROVIDERS 初始化默认配置
  Object.entries(PROVIDERS).forEach(([key, provider]) => {
    providers[key] = {
      name: provider.name,
      baseUrl: provider.baseUrl,
      websiteUrl: provider.websiteUrl,
      apiKey: '',
      selectedModel: '',
      models: provider.models,
    };
  });

  return {
    prioritizeGeminiNano: false,
    selectedProvider: '',
    selectedModel: '',
    apiKey: '',
    customApiUrl: '',
    customModel: '',
    providers,
  };
}

// 从 localStorage 加载设置
export function getLLMSettings(): LLMSettings {
  const data = localStorage.getItem(SETTINGS_KEY);
  
  if (data) {
    try {
      const parsed = JSON.parse(data);
      // 合并默认设置和用户设置，确保新增的配置项存在
      const defaultSettings = getDefaultSettings();
      return {
        ...defaultSettings,
        ...parsed,
        providers: {
          ...defaultSettings.providers,
          ...parsed.providers,
        },
      };
    } catch (error) {
      console.error('Failed to parse LLM settings:', error);
      return getDefaultSettings();
    }
  }
  
  return getDefaultSettings();
}

// 保存设置到 localStorage
export function saveLLMSettings(settings: LLMSettings): void {
  // 更新当前选中提供商的配置
  if (settings.selectedProvider && settings.selectedProvider !== 'custom') {
    const providerKey = settings.selectedProvider as ProviderKey;
    if (settings.providers[providerKey]) {
      settings.providers[providerKey] = {
        ...settings.providers[providerKey],
        apiKey: settings.apiKey,
        selectedModel: settings.selectedModel,
        customModel: settings.customModel,
      };
    }
  }

  // 如果是自定义提供商，将其添加到 providers 中
  if (settings.selectedProvider === 'custom' && settings.customApiUrl) {
    const customKey = settings.customApiUrl;
    settings.providers[customKey] = {
      name: '自定义',
      baseUrl: settings.customApiUrl,
      apiKey: settings.apiKey,
      selectedModel: settings.selectedModel,
      customModel: settings.customModel,
      models: [],
    };
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// 测试 LLM 连接
export async function testLLMConnection(settings: LLMSettings): Promise<void> {
  let baseUrl = '';
  let apiKey = settings.apiKey;
  let model = settings.selectedModel === 'custom' ? settings.customModel : settings.selectedModel;

  if (settings.selectedProvider === 'custom') {
    baseUrl = settings.customApiUrl || '';
  } else {
    const provider = PROVIDERS[settings.selectedProvider as ProviderKey];
    if (!provider) {
      throw new Error('未选择有效的服务商');
    }
    baseUrl = provider.baseUrl;
  }

  if (!baseUrl) {
    throw new Error('API URL 不能为空');
  }

  if (!apiKey) {
    throw new Error('API Key 不能为空');
  }

  if (!model) {
    throw new Error('模型不能为空');
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: '测试连接' }],
        max_tokens: 10,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
    }

    // 如果请求成功，说明连接正常
    const result = await response.json();
    if (!result.choices || result.choices.length === 0) {
      throw new Error('API 响应格式异常');
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查 API URL 是否正确');
    }
    throw error;
  }
}

// 从 LLM 输出中提取 JSON 字符串（兼容 ```json 代码块与带前后杂讯的文本）
export function extractJsonString(text: string): string | null {
  if (!text) return null;
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;
  const trimmed = candidate.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {}
  }
  const arrStart = trimmed.indexOf('[');
  const arrEnd = trimmed.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    const slice = trimmed.slice(arrStart, arrEnd + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {}
  }
  return null;
}

// 去除任意代码块围栏，返回内部纯文本
export function unwrapCodeFence(text: string): string {
  if (!text) return '';
  const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}
