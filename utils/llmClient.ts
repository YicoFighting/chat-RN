import { Provider } from '@/store/useSettingStore';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContent[];
}

interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface LLMClientOptions {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

function buildMessages(
  history: ChatMessage[],
  userText: string,
  imagesBase64?: string[]
): ChatMessage[] {
  const userContent: MessageContent[] = [];

  if (imagesBase64 && imagesBase64.length > 0) {
    imagesBase64.forEach((b64) => {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      });
    });
  }

  if (userText) {
    userContent.push({ type: 'text', text: userText });
  }

  const messages: ChatMessage[] = [...history];

  if (userContent.length === 1 && userContent[0].type === 'text') {
    messages.push({ role: 'user', content: userText });
  } else {
    messages.push({ role: 'user', content: userContent });
  }

  return messages;
}

export async function streamChat(
  options: LLMClientOptions,
  history: ChatMessage[],
  userText: string,
  imagesBase64?: string[],
  signal?: AbortSignal,
  onChunk: (text: string) => void = () => {},
  onThinking: (thinking: string) => void = () => {},
  onDone: () => void = () => {},
  onError: (error: Error) => void = () => {}
) {
  const { provider, baseUrl, apiKey, model } = options;
  const cleanApiKey = apiKey.replace(/\r?\n|\r/g, '').trim();
  const messages = buildMessages(history, userText, imagesBase64);

  const isOfficialAnthropic = provider === 'anthropic' && (baseUrl.includes('api.anthropic.com') || !baseUrl.trim());
  const url = isOfficialAnthropic
    ? `${baseUrl.replace(/\/$/, '')}/messages`
    : `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'anthropic') {
    headers['x-api-key'] = cleanApiKey;
    headers['anthropic-version'] = '2023-06-01';
    if (isOfficialAnthropic) {
      headers['anthropic-dangerously-allow-browser'] = 'true';
    }
  } else {
    headers['Authorization'] = `Bearer ${cleanApiKey}`;
  }

  let body = '';
  if (isOfficialAnthropic) {
    let systemText = '';
    const systemMsg = messages.find((m) => m.role === 'system');
    if (systemMsg) {
      systemText = typeof systemMsg.content === 'string' ? systemMsg.content : '';
    }
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const formattedMessages = nonSystemMessages.map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content };
      }
      const contentArray = m.content.map((item) => {
        if (item.type === 'text') {
          return { type: 'text', text: item.text || '' };
        } else if (item.type === 'image_url') {
          const urlVal = item.image_url?.url || '';
          const matches = urlVal.match(/^data:([^;]+);base64,(.+)$/);
          let mediaType = 'image/jpeg';
          let base64Data = urlVal;
          if (matches) {
            mediaType = matches[1];
            base64Data = matches[2];
          }
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          };
        }
        return item;
      });
      return { role: m.role, content: contentArray };
    });

    body = JSON.stringify({
      model,
      messages: formattedMessages,
      system: systemText || undefined,
      stream: true,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature,
    });
  } else {
    body = JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.log('No reader available on response.body, falling back to XHR streaming...');
      return streamChatXHR(
        options,
        url,
        headers,
        body,
        signal,
        onChunk,
        onThinking,
        onDone,
        onError
      );
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            if (isOfficialAnthropic) {
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                if (json.delta.text) {
                  onChunk(json.delta.text);
                }
              }
            } else {
              const delta = json.choices?.[0]?.delta;
              if (!delta) continue;

              const reasoningContent =
                delta.reasoning_content || delta.thinking || '';
              if (reasoningContent) {
                onThinking(reasoningContent);
              }

              if (delta.content) {
                onChunk(delta.content);
              }
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    }

    onDone();
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

async function streamChatXHR(
  options: LLMClientOptions,
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
  onChunk: (text: string) => void = () => {},
  onThinking: (thinking: string) => void = () => {},
  onDone: () => void = () => {},
  onError: (error: Error) => void = () => {}
) {
  const { provider } = options;
  const isOfficialAnthropic = provider === 'anthropic' && (options.baseUrl.includes('api.anthropic.com') || !options.baseUrl.trim());

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    for (const [key, val] of Object.entries(headers)) {
      xhr.setRequestHeader(key, val);
    }

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        const err = new DOMException('Aborted', 'AbortError');
        onError(err);
        reject(err);
        return;
      }
      signal.addEventListener('abort', () => {
        xhr.abort();
        const err = new DOMException('Aborted', 'AbortError');
        onError(err);
        reject(err);
      });
    }

    let seenBytes = 0;
    let buffer = '';

    const handleProgress = () => {
      const text = xhr.responseText;
      if (!text) return;
      
      const chunk = text.slice(seenBytes);
      seenBytes = text.length;

      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            if (isOfficialAnthropic) {
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                if (json.delta.text) {
                  onChunk(json.delta.text);
                }
              }
            } else {
              const delta = json.choices?.[0]?.delta;
              if (!delta) continue;

              const reasoningContent =
                delta.reasoning_content || delta.thinking || '';
              if (reasoningContent) {
                onThinking(reasoningContent);
              }

              if (delta.content) {
                onChunk(delta.content);
              }
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        handleProgress();
      }
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          onDone();
          resolve();
        } else {
          const err = new Error(`HTTP ${xhr.status}: ${xhr.responseText || 'XHR request failed'}`);
          onError(err);
          reject(err);
        }
      }
    };

    xhr.onerror = () => {
      const err = new Error('Network request failed (XHR)');
      onError(err);
      reject(err);
    };

    xhr.send(body);
  });
}
