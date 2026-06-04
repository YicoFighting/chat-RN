import React from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
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

export default function SettingScreen() {
  const { provider, baseUrl, apiKey, model, setSettings } = useSettingStore();

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

        {/* Model */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Model
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

        {/* Info */}
        <View className="mt-4 mb-8 p-4 rounded-xl bg-neutral-50 dark:bg-[#171717] border border-neutral-200 dark:border-neutral-800">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400 leading-5">
            Your API Key is stored locally on your device and is only used to communicate with the API provider you select. It is never sent to any third-party service.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
