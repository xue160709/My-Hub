export const PROVIDERS = {
  siliconflow: {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    websiteUrl: 'https://cloud.siliconflow.cn/i/2ty8He4Z',
    models: [
      {
        value: 'Qwen/Qwen3-30B-A3B-Instruct-2507',
        label: 'Qwen3-30B-A3B',
      },
      {
        value: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
        label: 'Qwen3-Coder-30B-A3B',
      },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    websiteUrl: 'https://openrouter.ai/settings/keys',
    models: [
      {
        value: 'anthropic/claude-sonnet-4',
        label: 'Claude-Sonnet-4',
      },
      {
        value: 'openai/gpt-5-mini',
        label: 'OpenAI GPT-5-Mini',
      },
      {
        value: 'google/gemini-2.5-flash',
        label: 'Google Gemini 2.5 Flash',
      },
      {
        value: 'google/gemini-2.5-flash-lite',
        label: 'Google Gemini 2.5 Flash Lite',
      },
      {
        value: 'x-ai/grok-code-fast-1',
        label: 'Grok Code Fast',
      },
    ],
  },
};

export type ProviderKey = keyof typeof PROVIDERS;

export interface Model {
  value: string;
  label: string;
}

export interface Provider {
  name: string;
  baseUrl: string;
  websiteUrl: string;
  models: Model[];
}
