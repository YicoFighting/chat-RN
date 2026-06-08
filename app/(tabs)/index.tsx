import MessageInput from "@/components/chat/MessageInput";
import MessageItem from "@/components/chat/MessageItem";
import { Message, useChatStore } from "@/store/useChatStore";
import { useSettingStore } from "@/store/useSettingStore";
import { streamChat } from "@/utils/llmClient";
import {
    Edit2,
    Menu,
    MessageSquare,
    Plus,
    Search,
    Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatScreen() {
  const {
    messages,
    sessions,
    currentSessionId,
    isStreaming,
    abortController,
    addMessage,
    updateLastAssistantMessage,
    updateLastAssistantThinking,
    setStreaming,
    setAbortController,
    deleteSingleMessage,
    createSession,
    deleteSession,
    renameSession,
    setCurrentSessionId,
    clearAllSessions,
  } = useChatStore();

  const {
    provider,
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    temperature,
    maxTokens,
  } = useSettingStore();
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // UI state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState("");
  const [renameText, setRenameText] = useState("");
  const [searchText, setSearchText] = useState("");

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const filteredSessions = sessions.filter((s) => {
    const query = searchText.trim().toLowerCase();
    if (!query) return true;
    const titleMatch = s.title.toLowerCase().includes(query);
    const contentMatch = s.messages.some((m) =>
      m.content.toLowerCase().includes(query),
    );
    return titleMatch || contentMatch;
  });

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(
    async (
      text: string,
      imagesBase64?: string[],
      documents?: { name: string; content: string }[],
      imagesUri?: string[],
    ) => {
      if (!apiKey.trim()) {
        addMessage({
          id: Date.now().toString(),
          role: "assistant",
          content: "Please configure your API Key in Settings first.",
          createdAt: Date.now(),
        });
        return;
      }

      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        imagesBase64,
        imagesUri,
        createdAt: Date.now(),
      };
      isNearBottomRef.current = true;
      addMessage(userMessage);

      // Add empty assistant message for streaming
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };
      addMessage(assistantMessage);
      setStreaming(true);

      // Create AbortController
      const controller = new AbortController();
      setAbortController(controller);

      // Build history for API with System Prompt injected if available
      const history: any[] = [];
      if (systemPrompt && systemPrompt.trim()) {
        history.push({ role: "system", content: systemPrompt.trim() });
      }

      const currentMsgs = useChatStore.getState().messages;
      // We skip the last empty assistant message we just added
      currentMsgs.slice(0, -1).forEach((m) => {
        history.push({
          role: m.role as "user" | "assistant",
          content: m.content,
        });
      });

      // Construct final prompt by appending document contexts if available
      let apiUserText = text;
      if (documents && documents.length > 0) {
        const docContexts = documents
          .map(
            (doc) =>
              `\n\n[导入文档上下文: ${doc.name}]\n-------------------\n${doc.content}\n-------------------`,
          )
          .join("");
        apiUserText = text + docContexts;
      }

      let accumulated = "";
      let accumulatedThinking = "";

      await streamChat(
        { provider, baseUrl, apiKey, model, temperature, maxTokens },
        history,
        apiUserText,
        imagesBase64,
        controller.signal,
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
          setAbortController(null);
        },
        (error) => {
          if (
            error.name === "AbortError" ||
            error.message.includes("aborted")
          ) {
            updateLastAssistantMessage(accumulated + " \n\n*_[生成已中止]_*");
          } else {
            updateLastAssistantMessage(`Error: ${error.message}`);
          }
          setStreaming(false);
          setAbortController(null);
        },
      );
    },
    [
      apiKey,
      provider,
      baseUrl,
      model,
      systemPrompt,
      temperature,
      maxTokens,
      addMessage,
      updateLastAssistantMessage,
      updateLastAssistantThinking,
      setStreaming,
      setAbortController,
    ],
  );

  const handleRegenerate = useCallback(async () => {
    const currentMsgs = useChatStore.getState().messages;
    if (currentMsgs.length < 2) return;

    const lastMsg = currentMsgs[currentMsgs.length - 1];
    if (lastMsg.role !== "assistant") return;

    const userMsg = currentMsgs[currentMsgs.length - 2];
    if (userMsg.role !== "user") return;

    // 1. Remove last assistant message
    useChatStore.getState().removeLastMessage();

    // 2. Add empty assistant message
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    isNearBottomRef.current = true;
    addMessage(assistantMessage);
    setStreaming(true);

    // 3. Create AbortController
    const controller = new AbortController();
    setAbortController(controller);

    // 4. Build history context
    const history: any[] = [];
    if (systemPrompt && systemPrompt.trim()) {
      history.push({ role: "system", content: systemPrompt.trim() });
    }

    const updatedMsgs = useChatStore.getState().messages;
    updatedMsgs.slice(0, -1).forEach((m) => {
      history.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    });

    let accumulated = "";
    let accumulatedThinking = "";

    await streamChat(
      { provider, baseUrl, apiKey, model, temperature, maxTokens },
      history,
      userMsg.content,
      userMsg.imagesBase64,
      controller.signal,
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
        setAbortController(null);
      },
      (error) => {
        if (error.name === "AbortError" || error.message.includes("aborted")) {
          updateLastAssistantMessage(accumulated + " \n\n*_[生成已中止]_*");
        } else {
          updateLastAssistantMessage(`Error: ${error.message}`);
        }
        setStreaming(false);
        setAbortController(null);
      },
    );
  }, [
    apiKey,
    provider,
    baseUrl,
    model,
    systemPrompt,
    temperature,
    maxTokens,
    addMessage,
    updateLastAssistantMessage,
    updateLastAssistantThinking,
    setStreaming,
    setAbortController,
  ]);

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const currentMsgs = useChatStore.getState().messages;
      const editMsg = currentMsgs.find((m) => m.id === messageId);
      const imagesBase64 = editMsg ? editMsg.imagesBase64 : undefined;

      // 1. Truncate conversation and update message content
      useChatStore.getState().editUserMessage(messageId, newContent);

      // 2. Add new empty assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };
      isNearBottomRef.current = true;
      addMessage(assistantMessage);
      setStreaming(true);

      // 3. Create AbortController
      const controller = new AbortController();
      setAbortController(controller);

      // 4. Build history context (including editMsg as the latest user question)
      const history: any[] = [];
      if (systemPrompt && systemPrompt.trim()) {
        history.push({ role: "system", content: systemPrompt.trim() });
      }

      const updatedMsgs = useChatStore.getState().messages;
      updatedMsgs.slice(0, -1).forEach((m) => {
        history.push({
          role: m.role as "user" | "assistant",
          content: m.content,
        });
      });

      let accumulated = "";
      let accumulatedThinking = "";

      await streamChat(
        { provider, baseUrl, apiKey, model, temperature, maxTokens },
        history,
        newContent,
        imagesBase64,
        controller.signal,
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
          setAbortController(null);
        },
        (error) => {
          if (
            error.name === "AbortError" ||
            error.message.includes("aborted")
          ) {
            updateLastAssistantMessage(accumulated + " \n\n*_[生成已中止]_*");
          } else {
            updateLastAssistantMessage(`Error: ${error.message}`);
          }
          setStreaming(false);
          setAbortController(null);
        },
      );
    },
    [
      apiKey,
      provider,
      baseUrl,
      model,
      systemPrompt,
      temperature,
      maxTokens,
      addMessage,
      updateLastAssistantMessage,
      updateLastAssistantThinking,
      setStreaming,
      setAbortController,
    ],
  );

  const handleClearAll = async () => {
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = window.confirm(
        "Are you sure you want to clear all chat sessions?",
      );
    } else {
      await new Promise<void>((resolve) => {
        Alert.alert(
          "Clear All Chats",
          "Are you sure you want to delete all chat sessions? This cannot be undone.",
          [
            {
              text: "Cancel",
              onPress: () => {
                confirmed = false;
                resolve();
              },
              style: "cancel",
            },
            {
              text: "Delete All",
              onPress: () => {
                confirmed = true;
                resolve();
              },
              style: "destructive",
            },
          ],
        );
      });
    }
    if (confirmed) {
      clearAllSessions();
      setIsDrawerOpen(false);
    }
  };

  const handleDeleteSession = async (id: string, title: string) => {
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = window.confirm(`Are you sure you want to delete "${title}"?`);
    } else {
      await new Promise<void>((resolve) => {
        Alert.alert(
          "Delete Chat",
          `Are you sure you want to delete "${title}"?`,
          [
            {
              text: "Cancel",
              onPress: () => {
                confirmed = false;
                resolve();
              },
              style: "cancel",
            },
            {
              text: "Delete",
              onPress: () => {
                confirmed = true;
                resolve();
              },
              style: "destructive",
            },
          ],
        );
      });
    }
    if (confirmed) {
      deleteSession(id);
    }
  };

  const handleStartRename = (id: string, title: string) => {
    setRenameSessionId(id);
    setRenameText(title);
    setIsRenameOpen(true);
  };

  const handleSaveRename = () => {
    if (renameText.trim()) {
      renameSession(renameSessionId, renameText.trim());
    }
    setIsRenameOpen(false);
  };

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isLast = index === messages.length - 1;
      return (
        <MessageItem
          message={item}
          isLast={isLast}
          onRegenerate={handleRegenerate}
          onDelete={() => deleteSingleMessage(item.id)}
          onEdit={handleEditMessage}
          disabled={isStreaming}
        />
      );
    },
    [
      messages.length,
      handleRegenerate,
      deleteSingleMessage,
      handleEditMessage,
      isStreaming,
    ],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const renderEmpty = useCallback(() => {
    return (
      <View className="flex-1 items-center justify-center pt-32">
        <MessageSquare color={isDark ? "#525252" : "#A3A3A3"} size={48} />
        <Text className="text-neutral-400 text-lg mt-4">
          Start a conversation
        </Text>
      </View>
    );
  }, [isDark]);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0D0D0D]" edges={["top"]}>
      {/* Custom Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-900 bg-white dark:bg-[#0D0D0D]">
        <TouchableOpacity
          onPress={() => setIsDrawerOpen(true)}
          className="p-2 rounded-full active:bg-neutral-100 dark:active:bg-neutral-900"
        >
          <Menu color={isDark ? "#FFF" : "#000"} size={22} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            handleStartRename(
              currentSession?.id || "",
              currentSession?.title || "",
            )
          }
          className="flex-row items-center max-w-[60%] px-3 py-1 rounded-full bg-neutral-50 dark:bg-[#171717]"
        >
          <Text
            numberOfLines={1}
            className="text-[15px] font-semibold text-neutral-900 dark:text-white mr-1.5"
          >
            {currentSession?.title || "Chat"}
          </Text>
          <Edit2 color="#737373" size={12} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            const newId = createSession();
            setCurrentSessionId(newId);
          }}
          className="p-2 rounded-full active:bg-neutral-100 dark:active:bg-neutral-900"
        >
          <Plus color={isDark ? "#FFF" : "#000"} size={22} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
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
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } =
              event.nativeEvent;
            const isNear =
              layoutMeasurement.height + contentOffset.y >=
              contentSize.height - 100;
            isNearBottomRef.current = isNear;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (isNearBottomRef.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />

        {isStreaming && (
          <View className="px-4 py-2 items-center">
            <ActivityIndicator
              size="small"
              color={isDark ? "#FFFFFF" : "#000000"}
            />
          </View>
        )}

        <MessageInput
          onSend={handleSend}
          disabled={isStreaming}
          isStreaming={isStreaming}
          onStop={() => {
            abortController?.abort();
            setStreaming(false);
            setAbortController(null);
          }}
        />
      </KeyboardAvoidingView>

      {/* Sidebar Drawer Modal */}
      <Modal
        visible={isDrawerOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsDrawerOpen(false)}
      >
        <View className="flex-1 flex-row">
          {/* Drawer content (left 80% screen width) */}
          <View className="w-[80%] h-full bg-white dark:bg-[#121212] border-r border-neutral-100 dark:border-neutral-900">
            <SafeAreaView
              className="flex-1 px-4 py-4"
              edges={["top", "bottom"]}
            >
              {/* Drawer Header */}
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold text-neutral-900 dark:text-white">
                  Chats
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newId = createSession();
                    setCurrentSessionId(newId);
                    setSearchText("");
                    setIsDrawerOpen(false);
                  }}
                  className="flex-row items-center px-3 py-1.5 bg-neutral-900 dark:bg-white rounded-full"
                >
                  <Plus color={isDark ? "#000" : "#FFF"} size={14} />
                  <Text className="text-xs font-semibold text-white dark:text-black ml-1">
                    New
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View className="flex-row items-center px-3 py-2.5 mb-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
                <Search color={isDark ? "#A3A3A3" : "#737373"} size={16} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search chats or messages..."
                  placeholderTextColor={isDark ? "#737373" : "#A3A3A3"}
                  className="flex-1 ml-2 text-sm text-neutral-900 dark:text-white p-0"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText("")}>
                    <Text className="text-xs text-neutral-400 dark:text-neutral-500 font-medium px-1">
                      Clear
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Sessions List */}
              <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
              >
                {filteredSessions.length === 0 ? (
                  <View className="flex-1 items-center justify-center py-8">
                    <Text className="text-sm text-neutral-400 dark:text-neutral-500">
                      No matching chats
                    </Text>
                  </View>
                ) : (
                  filteredSessions.map((s) => {
                    const isSelected = s.id === currentSessionId;
                    return (
                      <View
                        key={s.id}
                        className={`flex-row items-center justify-between p-3.5 mb-2 rounded-xl ${
                          isSelected
                            ? "bg-neutral-100 dark:bg-neutral-800"
                            : "active:bg-neutral-50 dark:active:bg-neutral-900/50"
                        }`}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            setCurrentSessionId(s.id);
                            setSearchText("");
                            setIsDrawerOpen(false);
                          }}
                          className="flex-1 flex-row items-center mr-2"
                        >
                          <MessageSquare
                            color={
                              isSelected
                                ? isDark
                                  ? "#FFF"
                                  : "#000"
                                : "#737373"
                            }
                            size={18}
                          />
                          <Text
                            numberOfLines={1}
                            className={`ml-3 text-sm flex-1 ${
                              isSelected
                                ? "font-semibold text-neutral-900 dark:text-white"
                                : "text-neutral-600 dark:text-neutral-400"
                            }`}
                          >
                            {s.title}
                          </Text>
                        </TouchableOpacity>

                        <View className="flex-row items-center">
                          <TouchableOpacity
                            onPress={() => handleStartRename(s.id, s.title)}
                            className="p-1.5 rounded-full active:bg-neutral-200 dark:active:bg-neutral-700 mr-1"
                          >
                            <Edit2 color="#737373" size={14} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleDeleteSession(s.id, s.title)}
                            className="p-1.5 rounded-full active:bg-neutral-200 dark:active:bg-neutral-700"
                          >
                            <Trash2 color="#EF4444" size={14} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {/* Drawer Footer */}
              <View className="border-t border-neutral-100 dark:border-neutral-900 pt-4">
                <TouchableOpacity
                  onPress={handleClearAll}
                  className="flex-row items-center p-3 rounded-xl bg-red-50 dark:bg-red-950/20 active:bg-red-100"
                >
                  <Trash2 color="#EF4444" size={16} />
                  <Text className="text-red-500 font-semibold text-sm ml-3">
                    Clear All Chats
                  </Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>

          {/* Backdrop (right 20% screen width, touch to close) */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsDrawerOpen(false)}
            className="w-[20%] h-full bg-black/40"
          />
        </View>
      </Modal>

      {/* Rename Session Modal */}
      <Modal
        visible={isRenameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRenameOpen(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm bg-white dark:bg-[#171717] rounded-3xl p-6 border border-neutral-100 dark:border-neutral-800">
            <Text className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
              Rename Session
            </Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Enter session name..."
              placeholderTextColor="#737373"
              autoFocus
              className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-900 text-neutral-950 dark:text-neutral-50 rounded-xl border border-neutral-200 dark:border-neutral-800 mb-6"
            />
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={() => setIsRenameOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800"
              >
                <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveRename}
                className="px-4 py-2.5 rounded-xl bg-black dark:bg-white"
              >
                <Text className="text-sm font-medium text-white dark:text-black">
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
