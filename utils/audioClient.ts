export interface TranscribeOptions {
  baseUrl: string;
  apiKey: string;
  uri: string;
}

export async function transcribeAudio(options: TranscribeOptions): Promise<string> {
  const { baseUrl, apiKey, uri } = options;
  const cleanApiKey = apiKey.replace(/\r?\n|\r/g, '').trim();

  // Normalize API Endpoint URL
  let url = baseUrl.replace(/\/$/, '');
  if (!url.includes('/audio/transcriptions')) {
    url = `${url}/audio/transcriptions`;
  }

  const formData = new FormData();

  const filename = uri.split('/').pop() || 'audio.m4a';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `audio/${match[1]}` : `audio/m4a`;

  // In React Native, files uploaded via FormData need to follow this specific signature
  formData.append('file', {
    uri: uri,
    name: filename,
    type: type,
  } as any);
  formData.append('model', 'whisper-1');

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${cleanApiKey}`,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`STT HTTP ${response.status}: ${errText}`);
  }

  const result = await response.json();
  return result.text || '';
}
