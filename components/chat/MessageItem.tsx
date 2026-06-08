import { Message } from "@/store/useChatStore";
import * as Clipboard from "expo-clipboard";
import * as Speech from "expo-speech";
import {
    Brain,
    Check,
    ChevronDown,
    Copy,
    Edit3,
    RotateCcw,
    Share2,
    Trash2,
    Volume2,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
    Animated,
    Dimensions,
    Image,
    Modal,
    Platform,
    ScrollView,
    Share,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    Vibration,
    View,
} from "react-native";
import Markdown from "react-native-markdown-display";

interface MessageItemProps {
  message: Message;
  isLast?: boolean;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onEdit?: (id: string, newContent: string) => void;
  disabled?: boolean;
}

interface CodeBlockProps {
  code: string;
  language: string;
  isDark: boolean;
}

function CodeBlock({ code, language, isDark }: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code.trim());
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <View className="my-2 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-900 dark:bg-[#121212] w-full">
      {/* Header bar */}
      <View className="flex-row items-center justify-between px-4 py-2 bg-neutral-800 dark:bg-[#1A1A1A] border-b border-neutral-700 dark:border-neutral-800">
        <Text className="text-xs font-semibold text-neutral-400 uppercase">
          {language || t('common.code')}
        </Text>
        <TouchableOpacity
          onPress={handleCopy}
          className="flex-row items-center px-2 py-1 rounded bg-neutral-700 dark:bg-neutral-800 active:bg-neutral-600"
        >
          {copied ? (
            <>
              <Check color="#22C55E" size={12} />
              <Text className="text-xs text-green-500 font-medium ml-1.5">
                {t('common.copied')}
              </Text>
            </>
          ) : (
            <>
              <Copy color="#A3A3A3" size={12} />
              <Text className="text-xs text-neutral-300 font-medium ml-1.5">
                {t('common.copy')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Code Text */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="w-full"
      >
        <Text
          style={{
            fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
          }}
          className="p-4 text-xs text-neutral-200 leading-5 select-text"
        >
          {code.trim()}
        </Text>
      </ScrollView>
    </View>
  );
}

export default function MessageItem({
  message,
  isLast,
  onRegenerate,
  onDelete,
  onEdit,
  disabled,
}: MessageItemProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const fadeAnim = useState(new Animated.Value(1))[0];
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // TTS, Context Menu & Edit state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editText, setEditText] = useState(message.content || "");

  // Image preview state
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    setEditText(message.content || "");
  }, [message.content]);

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

  const handleLongPress = () => {
    Vibration.vibrate(50);
    setIsMenuOpen(true);
  };

  const handleCopyAll = async () => {
    setIsMenuOpen(false);
    if (message.content) {
      await Clipboard.setStringAsync(message.content);
    }
  };

  const handleShare = async () => {
    setIsMenuOpen(false);
    if (message.content) {
      try {
        await Share.share({ message: message.content });
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const handleTTS = async () => {
    setIsMenuOpen(false);
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      Speech.speak(message.content, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
      });
    }
  };

  const markdownStyles = (isDark: boolean) => ({
    body: {
      color: isDark ? "#E5E5E5" : "#1A1A1A",
      fontSize: 16,
      lineHeight: 26,
    },
    link: {
      color: "#3B82F6",
      textDecorationLine: "underline" as const,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 12,
    },
    heading1: {
      color: isDark ? "#FFF" : "#0A0A0A",
      fontSize: 22,
      fontWeight: "bold" as const,
      marginTop: 20,
      marginBottom: 10,
      letterSpacing: -0.3,
    },
    heading2: {
      color: isDark ? "#FFF" : "#0A0A0A",
      fontSize: 18,
      fontWeight: "bold" as const,
      marginTop: 16,
      marginBottom: 8,
      letterSpacing: -0.2,
    },
    heading3: {
      color: isDark ? "#F5F5F5" : "#171717",
      fontSize: 16,
      fontWeight: "700" as const,
      marginTop: 12,
      marginBottom: 6,
    },
    bullet_list: {
      marginTop: 6,
      marginBottom: 12,
    },
    ordered_list: {
      marginTop: 6,
      marginBottom: 12,
    },
    list_item: {
      lineHeight: 24,
      marginVertical: 3,
      fontSize: 15,
    },
    code_inline: {
      fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
      backgroundColor: isDark ? "#262626" : "#F0F0F0",
      color: isDark ? "#F43F5E" : "#C2185B",
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      fontSize: 13,
    },
    blockquote: {
      backgroundColor: isDark ? "#1A1A1A" : "#FAFAFA",
      borderLeftColor: isDark ? "#404040" : "#D4D4D4",
      borderLeftWidth: 3,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginVertical: 12,
      borderRadius: 8,
    },
    table: {
      borderWidth: 1,
      borderColor: isDark ? "#333" : "#E5E5E5",
      borderRadius: 10,
      marginVertical: 12,
      overflow: "hidden" as const,
    },
    thead: {
      backgroundColor: isDark ? "#1F1F1F" : "#FAFAFA",
    },
    th: {
      padding: 10,
      fontWeight: "600" as const,
      fontSize: 14,
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#333" : "#E5E5E5",
    },
    td: {
      padding: 10,
    },
    hr: {
      marginTop: 16,
      marginBottom: 16,
      borderTopColor: isDark ? "#333" : "#E5E5E5",
      borderTopWidth: 1,
    },
  });

  const renderRules = {
    fence: (node: any) => {
      const codeText = node.content || "";
      const language = node.info || "code";
      return (
        <CodeBlock
          key={node.key}
          code={codeText}
          language={language}
          isDark={isDark}
        />
      );
    },
  };

  return (
    <View
      className={`px-4 w-full ${isUser ? "items-end" : "items-start"}`}
      style={{ paddingVertical: isUser ? 6 : 4 }}
    >
      {/* ─── User Message ─── */}
      {isUser && (
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={handleLongPress}
          className="max-w-[80%]"
        >
          {/* Image attachments */}
          {((message.imagesUri && message.imagesUri.length > 0) ||
            (message.imagesBase64 && message.imagesBase64.length > 0)) &&
            (() => {
              const displayImages =
                message.imagesUri && message.imagesUri.length > 0
                  ? message.imagesUri.map((uri) => ({
                      source: { uri },
                      key: uri,
                      previewUri: uri,
                    }))
                  : (message.imagesBase64 || []).map((b64, i) => ({
                      source: { uri: `data:image/jpeg;base64,${b64}` },
                      key: `b64-${i}`,
                      previewUri: `data:image/jpeg;base64,${b64}`,
                    }));
              const isSingle = displayImages.length === 1;
              return (
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {displayImages.map((img) => (
                    <TouchableOpacity
                      key={img.key}
                      activeOpacity={0.8}
                      onPress={() => setPreviewImageUri(img.previewUri)}
                    >
                      <Image
                        source={img.source}
                        className={`${isSingle ? "w-52 h-52" : "w-24 h-24"} rounded-2xl`}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

          {/* User text bubble */}
          {message.content ? (
            <View className="bg-black dark:bg-white rounded-[20px] rounded-br-md px-4 py-3">
              <Text className="text-[15px] leading-6 text-white dark:text-black font-medium">
                {message.content}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      )}

      {/* ─── Assistant Message ─── */}
      {!isUser && (
        <View className="w-full max-w-[92%]">
          {/* Thinking section - refined card */}
          {message.thinking && (
            <View className="mb-3">
              <TouchableOpacity
                onPress={toggleThinking}
                className="flex-row items-center py-2.5 px-4 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/60 active:opacity-70"
              >
                <Brain
                  color={isDark ? "#A3A3A3" : "#737373"}
                  size={15}
                />
                <Text className="text-[13px] text-neutral-500 dark:text-neutral-400 ml-2 font-semibold tracking-wide">
                  {t('common.thinking')}
                </Text>
                <ChevronDown
                  color={isDark ? "#737373" : "#A3A3A3"}
                  size={15}
                  className="ml-1"
                  style={{
                    transform: [{ rotate: thinkingExpanded ? '0deg' : '-90deg' }],
                  }}
                />
              </TouchableOpacity>

              {thinkingExpanded && (
                <Animated.View
                  style={{ opacity: fadeAnim }}
                  className="mt-2 mx-1 px-4 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/40"
                >
                  <Text className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-[22px]">
                    {message.thinking}
                  </Text>
                </Animated.View>
              )}
            </View>
          )}

          {/* AI content - clean typography, no bubble */}
          {message.content ? (
            <View className="w-full">
              <Markdown style={markdownStyles(isDark)} rules={renderRules}>
                {message.content}
              </Markdown>
            </View>
          ) : null}

          {/* Assistant action buttons */}
          {(isLast && !disabled && message.content) && (
            <View className="flex-row items-center mt-3 -ml-1 gap-1">
              <TouchableOpacity
                onPress={onRegenerate}
                className="p-2 rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <RotateCcw color={isDark ? "#737373" : "#A3A3A3"} size={16} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCopyAll}
                className="p-2 rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <Copy color={isDark ? "#737373" : "#A3A3A3"} size={16} />
              </TouchableOpacity>
              {message.content ? (
                <TouchableOpacity
                  onPress={handleTTS}
                  className="p-2 rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
                >
                  <Volume2
                    color={isSpeaking ? "#EF4444" : isDark ? "#737373" : "#A3A3A3"}
                    size={16}
                  />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={handleLongPress}
                className="p-2 rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <Edit3 color={isDark ? "#737373" : "#A3A3A3"} size={16} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Bottom Sheet Menu */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsMenuOpen(false)}
          className="flex-1 bg-black/40 justify-end"
        >
          <View className="bg-white dark:bg-[#121212] rounded-t-3xl px-6 pt-6 pb-8 border-t border-neutral-100 dark:border-neutral-900">
            {/* Grabber */}
            <View className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mb-6 mx-auto" />

            <Text className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-4">
              {t('common.options')}
            </Text>

            {/* Edit Message (User Only) */}
            {isUser && (
              <TouchableOpacity
                onPress={() => {
                  setIsMenuOpen(false);
                  setIsEditOpen(true);
                }}
                className="flex-row items-center py-4 border-b border-neutral-100 dark:border-neutral-900 active:opacity-60"
              >
                <Edit3 color={isDark ? "#FFF" : "#000"} size={18} />
                <Text className="text-base font-semibold text-neutral-900 dark:text-white ml-4">
                  {t('common.editMessage')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Copy Button */}
            <TouchableOpacity
              onPress={handleCopyAll}
              className="flex-row items-center py-4 border-b border-neutral-100 dark:border-neutral-900 active:opacity-60"
            >
              <Copy color={isDark ? "#FFF" : "#000"} size={18} />
              <Text className="text-base font-semibold text-neutral-900 dark:text-white ml-4">
                {t('common.copyText')}
              </Text>
            </TouchableOpacity>

            {/* TTS Button */}
            {message.content ? (
              <TouchableOpacity
                onPress={handleTTS}
                className="flex-row items-center py-4 border-b border-neutral-100 dark:border-neutral-900 active:opacity-60"
              >
                <Volume2
                  color={isSpeaking ? "#EF4444" : isDark ? "#FFF" : "#000"}
                  size={18}
                />
                <Text
                  className={`text-base font-semibold ml-4 ${
                    isSpeaking
                      ? "text-red-500"
                      : "text-neutral-900 dark:text-white"
                  }`}
                >
                  {isSpeaking ? t('common.stopReading') : t('common.readAloud')}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Share Message Button */}
            {message.content ? (
              <TouchableOpacity
                onPress={handleShare}
                className="flex-row items-center py-4 border-b border-neutral-100 dark:border-neutral-900 active:opacity-60"
              >
                <Share2 color={isDark ? "#FFF" : "#000"} size={18} />
                <Text className="text-base font-semibold text-neutral-900 dark:text-white ml-4">
                  {t('common.shareMessage')}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Delete Button */}
            <TouchableOpacity
              onPress={() => {
                setIsMenuOpen(false);
                onDelete?.();
              }}
              className="flex-row items-center py-4 active:opacity-60"
            >
              <Trash2 color="#EF4444" size={18} />
              <Text className="text-base font-semibold text-red-500 ml-4">
                {t('common.deleteMessage')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit User Message Modal */}
      <Modal
        visible={isEditOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditOpen(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm bg-white dark:bg-[#171717] rounded-3xl p-6 border border-neutral-100 dark:border-neutral-800">
            <Text className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
              {t('common.editMessage')}
            </Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              placeholder={t('messageInput.editYourMessage')}
              placeholderTextColor="#737373"
              multiline
              autoFocus
              className="w-full min-h-[100px] px-4 py-3 bg-neutral-50 dark:bg-neutral-900 text-neutral-950 dark:text-neutral-50 rounded-xl border border-neutral-200 dark:border-neutral-800 mb-6"
              style={{ textAlignVertical: "top" }}
            />
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={() => setIsEditOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800"
              >
                <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (editText.trim()) {
                    onEdit?.(message.id, editText.trim());
                  }
                  setIsEditOpen(false);
                }}
                className="px-4 py-2.5 rounded-xl bg-black dark:bg-white"
              >
                <Text className="text-sm font-medium text-white dark:text-black">
                  {t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen Image Preview Modal */}
      <Modal
        visible={!!previewImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPreviewImageUri(null)}
          className="flex-1 bg-black/90 items-center justify-center"
        >
          {previewImageUri && (
            <Image
              source={{ uri: previewImageUri }}
              style={{
                width: Dimensions.get("window").width - 32,
                height: Dimensions.get("window").height * 0.7,
              }}
              resizeMode="contain"
            />
          )}
          <Text className="text-white/60 text-sm mt-6 font-medium">
            {t('common.clickToClose')}
          </Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
