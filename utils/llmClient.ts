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
}

function buildMessages(
  history: ChatMessage[],
  userText: string,
  imageBase64?: string
): ChatMessage[] {
  const userContent: MessageContent[] = [];

  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
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
  imageBase64?: string,
  onChunk: (text: string) => void = () => {},
  onThinking: (thinking: string) => void = () => {},
  onDone: () => void = () => {},
  onError: (error: Error) => void = () => {}
) {
  const { provider, baseUrl, apiKey, model } = options;
  const messages = buildMessages(history, userText, imageBase64);

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No reader available');
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
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;

            // Handle thinking/reasoning content from different providers
            // DeepSeek: delta.reasoning_content
            // Some OpenAI-compatible APIs: delta.reasoning_content
            // Anthropic (via adapter): delta.thinking or content blocks
            const reasoningContent =
              delta.reasoning_content || delta.thinking || '';
            if (reasoningContent) {
              onThinking(reasoningContent);
            }

            // Handle normal content
            if (delta.content) {
              onChunk(delta.content);
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
