import { Message } from "@/store/useChatStore";
import { Image } from "expo-image";
import { Brain, ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";

interface MessageItemProps {
  message: Message;
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const fadeAnim = useState(new Animated.Value(1))[0];

  const toggleThinking = () => {
    const newValue = !thinkingExpanded;
    if (newValue) {
      setThinkingExpanded(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setThinkingExpanded(false);
      });
    }
  };

  return (
    <View className={`px-4 py-2 ${isUser ? "items-end" : "items-start"}`}>
      <View
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-black dark:bg-white"
            : "bg-neutral-100 dark:bg-neutral-800"
        }`}
      >
        {message.imageBase64 && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${message.imageBase64}` }}
            className="w-48 h-48 rounded-xl mb-2"
            contentFit="cover"
          />
        )}

        {/* Thinking section */}
        {message.thinking && !isUser && (
          <View className="mb-2">
            <TouchableOpacity
              onPress={toggleThinking}
              className="flex-row items-center py-1"
            >
              <Brain
                color={
                  isUser ? (thinkingExpanded ? "#fff" : "#aaa") : "#737373"
                }
                size={14}
              />
              <Text className="text-xs text-neutral-500 dark:text-neutral-400 ml-1.5 font-medium">
                Thinking
              </Text>
              {thinkingExpanded ? (
                <ChevronDown color="#737373" size={14} className="ml-1" />
              ) : (
                <ChevronRight color="#737373" size={14} className="ml-1" />
              )}
            </TouchableOpacity>

            {thinkingExpanded && (
              <Animated.View
                style={{ opacity: fadeAnim }}
                className="border-l-2 border-neutral-300 dark:border-neutral-600 pl-3 mt-1 mb-1"
              >
                <Text className="text-xs text-neutral-500 dark:text-neutral-400 leading-5">
                  {message.thinking}
                </Text>
              </Animated.View>
            )}
          </View>
        )}

        {message.content ? (
          <Text
            className={`text-[15px] leading-6 ${
              isUser
                ? "text-white dark:text-black"
                : "text-neutral-900 dark:text-neutral-100"
            }`}
          >
            {message.content}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
