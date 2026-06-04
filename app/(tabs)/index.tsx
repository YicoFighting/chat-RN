import React, { useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatStore, Message } from '@/store/useChatStore';
import { useSettingStore } from '@/store/useSettingStore';
import { streamChat } from '@/utils/llmClient';
import MessageItem from '@/components/chat/MessageItem';
import MessageInput from '@/components/chat/MessageInput';
import { MessageSquare } from 'lucide-react-native';
import { useColorScheme } from 'react-native';

export default function ChatScreen() {
  const { messages, isStreaming, addMessage, updateLastAssistantMessage, updateLastAssistantThinking, setStreaming } =
    useChatStore();
  const { provider, baseUrl, apiKey, model } = useSettingStore();
  const flatListRef = useRef<FlatList>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(
    async (text: string, imageBase64?: string) => {
      if (!apiKey.trim()) {
        addMessage({
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Please configure your API Key in Settings first.',
          createdAt: Date.now(),
        });
        return;
      }

      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        imageBase64,
        createdAt: Date.now(),
      };
      addMessage(userMessage);

      // Add empty assistant message for streaming
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };
      addMessage(assistantMessage);
      setStreaming(true);

      // Build history for API
      const history = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      let accumulated = '';
      let accumulatedThinking = '';

      await streamChat(
        { provider, baseUrl, apiKey, model },
        history,
        text,
        imageBase64,
        (chunk) => {
          accumulated += chunk;
          updateLastAssistantMessage(accumulated);
        },
        (thinkingChunk) => {
          accumulatedThinking += thinkingChunk;
          updateLastAssistantThinking(accumulatedThinking);
        },
        () => {
          setStreaming(false);
        },
        (error) => {
          updateLastAssistantMessage(`Error: ${error.message}`);
          setStreaming(false);
        }
      );
    },
    [
      apiKey,
      provider,
      baseUrl,
      model,
      messages,
      addMessage,
      updateLastAssistantMessage,
      updateLastAssistantThinking,
      setStreaming,
    ]
  );

  const renderItem = useCallback(({ item }: { item: Message }) => {
    return <MessageItem message={item} />;
  }, []);

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const renderEmpty = useCallback(() => {
    return (
      <View className="flex-1 items-center justify-center pt-32">
        <MessageSquare
          color={isDark ? '#525252' : '#A3A3A3'}
          size={48}
        />
        <Text className="text-neutral-400 text-lg mt-4">
          Start a conversation
        </Text>
      </View>
    );
  }, [isDark]);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0D0D0D]" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
        />

        {isStreaming && (
          <View className="px-4 py-1">
            <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#000000'} />
          </View>
        )}

        <MessageInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
