declare module '*.svg' {
  import React = require('react');
  export const ReactComponent: React.SFC<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

declare module '*.json' {
  const content: string;
  export default content;
}

interface LanguageModel {
  availability(): Promise<'available' | 'unavailable' | 'downloading' | 'downloadable'>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  params(): Promise<LanguageModelParams>;
}

interface LanguageModelCreateOptions {
  signal?: AbortSignal;
  topK?: number;
  temperature?: number;
  initialPrompts?: any[];
  expectedInputs?: any[];
  expectedOutputs?: any[];
}

interface LanguageModelParams {
  defaultTopK: number;
  maxTopK: number;
  defaultTemperature: number;
  maxTemperature: number;
}

interface LanguageModelSession {
  prompt(messages: any[], options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(messages: any[], options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
  inputUsage: number;
  inputQuota: number;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  append(messages: any[]): Promise<void>;
  measureInputUsage(options?: { responseConstraint?: any, omitResponseConstraintInput?: boolean }): Promise<{ totalTokens: number }>;
}

declare const LanguageModel: LanguageModel;
