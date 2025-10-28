export interface LLMSettings {
  prioritizeGeminiNano: boolean;
  selectedProvider: string;
  selectedModel: string;
  apiKey: string;
  customApiUrl?: string;
  customModel?: string;
  providers: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  websiteUrl?: string;
  apiKey: string;
  selectedModel: string;
  customModel?: string;
  models: Array<{ value: string; label: string }>;
}
