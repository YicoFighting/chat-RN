import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingStore, Provider } from '@/store/useSettingStore';
import { Check } from 'lucide-react-native';

const PROVIDERS: { key: Provider; label: string; defaultUrl: string; defaultModel: string }[] = [
  { key: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { key: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-20241022' },
  { key: 'deepseek', label: 'DeepSeek', defaultUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { key: 'custom', label: 'Custom', defaultUrl: '', defaultModel: '' },
];

const MODEL_PRESETS: Record<Provider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  custom: [],
};

export default function SettingScreen() {
  const { provider, baseUrl, apiKey, model, systemPrompt, temperature, maxTokens, setSettings } = useSettingStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleProviderChange = (newProvider: Provider) => {
    const providerConfig = PROVIDERS.find((p) => p.key === newProvider);
    if (providerConfig) {
      setSettings({
        provider: newProvider,
        baseUrl: providerConfig.defaultUrl,
        model: providerConfig.defaultModel,
      });
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter API Key first.' });
      return;
    }
    
    setTesting(true);
    setTestResult(null);

    const isOfficialAnthropic = provider === 'anthropic' && (baseUrl.includes('api.anthropic.com') || !baseUrl.trim());
    const testUrl = isOfficialAnthropic
      ? `${baseUrl.replace(/\/$/, '')}/messages`
      : `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      if (isOfficialAnthropic) {
        headers['anthropic-dangerously-allow-browser'] = 'true';
      }
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) {
        setTestResult({ success: true, message: 'Connection successful!' });
      } else {
        const text = await response.text();
        setTestResult({ success: false, message: `HTTP ${response.status}: ${text.slice(0, 100)}` });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Network error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0D0D0D]" edges={['top']}>
      <ScrollView className="px-6 pt-8" showsVerticalScrollIndicator={false}>
        <Text className="text-2xl font-semibold mb-8 text-neutral-900 dark:text-white">
          Settings
        </Text>

        {/* Provider Selection */}
        <View className="mb-8">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
            Provider
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => handleProviderChange(p.key)}
                className={`px-4 py-2 rounded-xl border ${
                  provider === p.key
                    ? 'border-black dark:border-white bg-black dark:bg-white'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#171717]'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    provider === p.key
                      ? 'text-white dark:text-black'
                      : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* API Base URL */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            API Base URL
          </Text>
          <TextInput
            value={baseUrl}
            onChangeText={(text) => setSettings({ baseUrl: text })}
            placeholder="https://api.openai.com/v1"
            placeholderTextColor="#737373"
            autoCapitalize="none"
            autoCorrect={false}
            className="w-full px-4 py-3 bg-neutral-50 dark:bg-[#171717] text-neutral-950 dark:text-neutral-50 rounded-xl border border-neutral-200 dark:border-neutral-800"
          />
        </View>

        {/* API Key */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            API Key
          </Text>
          <TextInput
            value={apiKey}
            onChangeText={(text) => setSettings({ apiKey: text })}
            secureTextEntry
            placeholder="sk-..."
            placeholderTextColor="#737373"
            autoCapitalize="none"
            autoCorrect={false}
            className="w-full px-4 py-3 bg-neutral-50 dark:bg-[#171717] text-neutral-950 dark:text-neutral-50 rounded-xl border border-neutral-200 dark:border-neutral-800"
          />
        </View>

        {/* Model Presets */}
        {provider !== 'custom' && MODEL_PRESETS[provider]?.length > 0 && (
          <View className="mb-4">
            <Text className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-2">
              Model Presets
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {MODEL_PRESETS[provider].map((presetModel) => {
                const isSelected = model === presetModel;
                return (
                  <TouchableOpacity
                    key={presetModel}
                    onPress={() => setSettings({ model: presetModel })}
                    className={`px-3 py-1.5 rounded-lg border ${
                      isSelected
                        ? 'border-neutral-900 dark:border-white bg-neutral-950 dark:bg-white'
                        : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#171717]'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isSelected
                          ? 'text-white dark:text-black'
                          : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {presetModel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Model */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Model Identifier
          </Text>
          <TextInput
            value={model}
            onChangeText={(text) => setSettings({ model: text })}
            placeholder="gpt-4o"
            placeholderTextColor="#737373"
            autoCapitalize="none"
            autoCorrect={false}
            className="w-full px-4 py-3 bg-neutral-50 dark:bg-[#171717] text-neutral-950 dark:text-neutral-50 rounded-xl border border-neutral-200 dark:border-neutral-800"
          />
        </View>

        {/* System Prompt */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            System Prompt
          </Text>
          <TextInput
            value={systemPrompt}
            onChangeText={(text) => setSettings({ systemPrompt: text })}
            placeholder="e.g. You are a helpful assistant..."
            placeholderTextColor="#737373"
            multiline
            className="w-full px-4 py-3 bg-neutral-50 dark:bg-[#171717] text-neutral-950 dark:text-neutral-50 rounded-xl border border-neutral-200 dark:border-neutral-800 min-h-[80px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>

        {/* Temperature Stepper */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Temperature: {temperature?.toFixed(1) || '0.7'}
          </Text>
          <View className="flex-row items-center justify-between bg-neutral-50 dark:bg-[#171717] rounded-xl border border-neutral-200 dark:border-neutral-800 p-2">
            <TouchableOpacity
              onPress={() => setSettings({ temperature: Math.max(0, parseFloat((temperature - 0.1).toFixed(1))) })}
              className="w-10 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-lg items-center justify-center active:opacity-60"
            >
              <Text className="text-lg font-bold text-neutral-800 dark:text-neutral-200">-</Text>
            </TouchableOpacity>
            
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">
              {temperature?.toFixed(1) || '0.7'}
            </Text>

            <TouchableOpacity
              onPress={() => setSettings({ temperature: Math.min(2.0, parseFloat((temperature + 0.1).toFixed(1))) })}
              className="w-10 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-lg items-center justify-center active:opacity-60"
            >
              <Text className="text-lg font-bold text-neutral-800 dark:text-neutral-200">+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Max Tokens Stepper */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Max Tokens: {maxTokens || '2048'}
          </Text>
          <View className="flex-row items-center justify-between bg-neutral-50 dark:bg-[#171717] rounded-xl border border-neutral-200 dark:border-neutral-800 p-2">
            <TouchableOpacity
              onPress={() => setSettings({ maxTokens: Math.max(256, maxTokens - 256) })}
              className="w-10 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-lg items-center justify-center active:opacity-60"
            >
              <Text className="text-lg font-bold text-neutral-800 dark:text-neutral-200">-</Text>
            </TouchableOpacity>
            
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">
              {maxTokens || '2048'}
            </Text>

            <TouchableOpacity
              onPress={() => setSettings({ maxTokens: Math.min(8192, maxTokens + 256) })}
              className="w-10 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-lg items-center justify-center active:opacity-60"
            >
              <Text className="text-lg font-bold text-neutral-800 dark:text-neutral-200">+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Test Connection Button */}
        <View className="mb-6">
          <TouchableOpacity
            onPress={handleTestConnection}
            disabled={testing}
            className="w-full py-3.5 bg-neutral-950 dark:bg-white rounded-xl items-center justify-center active:opacity-80"
          >
            {testing ? (
              <ActivityIndicator color={isDark ? '#000' : '#FFF'} size="small" />
            ) : (
              <Text className="text-white dark:text-black font-semibold text-sm">
                Test Connection
              </Text>
            )}
          </TouchableOpacity>

          {testResult && (
            <View className={`mt-3 p-3.5 rounded-xl border ${
              testResult.success 
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30' 
                : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30'
            }`}>
              <Text className={`text-xs font-semibold ${
                testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {testResult.message}
              </Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View className="mt-2 mb-12 p-4 rounded-xl bg-neutral-50 dark:bg-[#171717] border border-neutral-200 dark:border-neutral-800">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400 leading-5">
            Your API Key is stored locally on your device and is only used to communicate with the API provider you select. It is never sent to any third-party service.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
