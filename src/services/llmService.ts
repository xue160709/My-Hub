import { getLLMSettings } from '../lib/llmUtils';
import { PROVIDERS, ProviderKey } from '../data/models';

// 定义回调函数类型
type OnUpdateCallback = (chunk: string) => void;
type OnFinishCallback = (reason: string) => void;
type OnErrorCallback = (error: Error) => void;

type SendMessageCallbacks = {
    onUpdate: (chunk: string) => void;
    onFinish: (fullText?: string) => void; // Can receive the full text in non-stream mode
    onError: (error: Error) => void;
};

type SendMessageOptions = {
    stream?: boolean;
};

async function tryGeminiNano(
    messages: any[],
    callbacks: SendMessageCallbacks,
    abortSignal: AbortSignal | undefined,
    options: SendMessageOptions
) {
    if (typeof LanguageModel === 'undefined' || typeof LanguageModel.availability !== 'function') {
        throw new Error('Prompt API entry point not available.');
    }
    const availability = await LanguageModel.availability();
    if (availability !== 'available') {
        throw new Error(`Gemini Nano is not available. State: ${availability}`);
    }

    console.log('[LLM Service][GeminiNano] Using Gemini Nano (Prompt API).');
    console.log('[LLM Service][GeminiNano] Input messages:', JSON.stringify(messages, null, 2));

    const session = await LanguageModel.create();

    try {
        if (options.stream) {
            const stream = session.promptStreaming(messages, { signal: abortSignal });
            for await (const chunk of stream) {
                //console.log('[LLM Service][GeminiNano][Stream] chunk:', chunk);
                callbacks.onUpdate(chunk);
            }
            console.log('[LLM Service][GeminiNano][Stream] finished');
            callbacks.onFinish();
        } else {
            const result = await session.prompt(messages, { signal: abortSignal });
            console.log('[LLM Service][GeminiNano][NonStream] result:', result);
            callbacks.onFinish(result);
        }
    } finally {
        session.destroy();
    }
}

/**
 * 向 LLM 发送消息并获取流式响应
 * @param messages 聊天消息列表
 * @param callbacks 事件回调函数
 * @param abortSignal AbortSignal to abort the request
 */
export async function sendMessage(
  messages: any[],
  callbacks: SendMessageCallbacks,
  abortSignal?: AbortSignal,
  options: SendMessageOptions = { stream: true }
) {
  const settings = getLLMSettings();
  console.log('LLM Service: Sending message with settings:', settings);

  if (settings.prioritizeGeminiNano) {
      try {
          console.log('LLM Service: Prioritizing Gemini Nano. Will attempt Prompt API first.');
          await tryGeminiNano(messages, callbacks, abortSignal, options);
          return; // Gemini Nano succeeded, so we're done.
      } catch (error) {
          console.warn('LLM Service: Gemini Nano failed, falling back to configured LLM.', error);
          // Fall through to the cloud LLM logic below.
      }
  }

  if (!settings.selectedProvider || !settings.apiKey) {
    const error = new Error('未配置服务商或 API Key');
    console.error('LLM Service Error:', error);
    return callbacks.onError(error);
  }

  let baseUrl = '';
  let model = '';

  // 获取 baseUrl 和 model
  if (settings.selectedProvider === 'custom') {
    baseUrl = settings.customApiUrl || '';
    model = settings.selectedModel === 'custom' ? (settings.customModel || '') : settings.selectedModel;
  } else {
    const provider = PROVIDERS[settings.selectedProvider as ProviderKey];
    if (!provider) {
      return callbacks.onError(new Error(`未找到服务商: ${settings.selectedProvider}`));
    }
    baseUrl = provider.baseUrl;
    model = settings.selectedModel === 'custom' ? (settings.customModel || '') : settings.selectedModel;
  }

  if (!baseUrl) {
    return callbacks.onError(new Error('API URL 未配置'));
  }

  if (!model) {
    return callbacks.onError(new Error('未选择模型'));
  }

  const requestBody = {
    model: model,
    messages: messages,
    stream: options.stream,
  };

  console.log('[LLM Service][Cloud] Using provider:', settings.selectedProvider, 'baseUrl:', baseUrl, 'model:', model);
  console.log('[LLM Service][Cloud] Input messages:', JSON.stringify(messages, null, 2));
  console.log('[LLM Service][Cloud] Request body:', JSON.stringify(requestBody, null, 2));


  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorBody}`);
    }

    if (options.stream) {
        if (!response.body) {
            throw new Error('Response body is null');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        const processStream = async () => {
          while (true) {
            if (abortSignal?.aborted) {
                reader.cancel();
                break;
            }

            const { done, value } = await reader.read();
            if (done) {
              console.log('LLM Service: Stream finished.');
              callbacks.onFinish();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            console.log('[LLM Service][Cloud][Stream] raw chunk:', chunk);
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6);
                    if (dataStr === '[DONE]') {
                        console.log('LLM Service: Stream finished (DONE marker).');
                        callbacks.onFinish();
                        return;
                    }
                    try {
                        const data = JSON.parse(dataStr);
                        //console.log('LLM Service: Parsed data:', data);
                        const content = data.choices[0]?.delta?.content;
                        if (content) {
                            console.log('[LLM Service][Cloud][Stream] content:', content);
                            callbacks.onUpdate(content);
                        }
                    } catch (error) {
                        console.error('LLM Service: Error parsing stream data chunk:', error, 'Chunk:', dataStr);
                    }
                }
            }
          }
        };

        processStream().catch(err => {
            if (!abortSignal?.aborted) {
                console.error('LLM Service: Stream processing error:', err);
                callbacks.onError(err);
            } else {
                console.log('LLM Service: Stream processing aborted as expected.');
                // 确保在中止时也能正常结束
                callbacks.onFinish();
            }
        });
    } else {
        // Handle non-streaming response
        const data = await response.json();
        console.log('LLM Service: Received non-streamed response:', data);
        const content = data.choices?.[0]?.message?.content || '';
        console.log('[LLM Service][Cloud][NonStream] content:', content);
        callbacks.onFinish(content);
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
        console.log('LLM Service: Request aborted by user.');
        // Don't call onError for user-initiated aborts
        return;
    }
    console.error('LLM Service: Fetch request failed:', error);
    callbacks.onError(error as Error);
  }
}
