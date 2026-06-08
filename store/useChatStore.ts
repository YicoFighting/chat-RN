import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

let mmkvStorage: {
  setItem: (name: string, value: string) => void;
  getItem: (name: string) => string | null;
  removeItem: (name: string) => void;
};

if (Platform.OS !== "web") {
  try {
    const { MMKV } = require("react-native-mmkv");
    const storage = new MMKV();
    mmkvStorage = {
      setItem: (name: string, value: string) => storage.set(name, value),
      getItem: (name: string) => storage.getString(name) ?? null,
      removeItem: (name: string) => storage.delete(name),
    };
  } catch {
    const memoryStore: Record<string, string> = {};
    mmkvStorage = {
      setItem: (name: string, value: string) => {
        memoryStore[name] = value;
      },
      getItem: (name: string) => memoryStore[name] ?? null,
      removeItem: (name: string) => {
        delete memoryStore[name];
      },
    };
  }
} else {
  mmkvStorage = {
    setItem: (name: string, value: string) => {
      try {
        localStorage.setItem(name, value);
      } catch {}
    },
    getItem: (name: string) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    removeItem: (name: string) => {
      try {
        localStorage.removeItem(name);
      } catch {}
    },
  };
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  imagesBase64?: string[];
  imagesUri?: string[];
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: Message[];
  isStreaming: boolean;
  abortController: AbortController | null;

  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  clearAllSessions: () => void;

  addMessage: (message: Message) => void;
  updateLastAssistantMessage: (content: string) => void;
  updateLastAssistantThinking: (thinking: string) => void;
  setStreaming: (streaming: boolean) => void;
  setAbortController: (controller: AbortController | null) => void;
  deleteSingleMessage: (id: string) => void;
  removeLastMessage: () => void;
  editUserMessage: (id: string, newContent: string) => void;
  clearMessages: () => void;

  cacheImagesBase64: (messageId: string, base64Array: string[]) => void;
  getCachedImagesBase64: (messageId: string) => string[] | undefined;
}

const defaultSessionId = "default";
const defaultSession: ChatSession = {
  id: defaultSessionId,
  title: "Default Chat",
  messages: [],
  createdAt: Date.now(),
};

// Non-persisted runtime cache for imagesBase64 (too large for MMKV)
const _base64Cache = new Map<string, string[]>();

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      sessions: [defaultSession],
      currentSessionId: defaultSessionId,
      messages: [],
      isStreaming: false,
      abortController: null,

      setAbortController: (controller) => set({ abortController: controller }),

      createSession: (title) => {
        const id = Date.now().toString();
        const newSession: ChatSession = {
          id,
          title: title || "New Chat",
          messages: [],
          createdAt: Date.now(),
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: id,
          messages: [],
        }));
        return id;
      },

      deleteSession: (id) =>
        set((state) => {
          const updatedSessions = state.sessions.filter((s) => s.id !== id);
          let nextSessionId = state.currentSessionId;

          if (state.currentSessionId === id) {
            nextSessionId =
              updatedSessions.length > 0 ? updatedSessions[0].id : null;
          }

          if (updatedSessions.length === 0) {
            const newId = Date.now().toString();
            const newSession: ChatSession = {
              id: newId,
              title: "New Chat",
              messages: [],
              createdAt: Date.now(),
            };
            return {
              sessions: [newSession],
              currentSessionId: newId,
              messages: [],
            };
          }

          const nextSession = updatedSessions.find(
            (s) => s.id === nextSessionId,
          );
          return {
            sessions: updatedSessions,
            currentSessionId: nextSessionId,
            messages: nextSession ? nextSession.messages : [],
          };
        }),

      renameSession: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title } : s,
          ),
        })),

      setCurrentSessionId: (id) =>
        set((state) => {
          const session = state.sessions.find((s) => s.id === id);
          return {
            currentSessionId: id,
            messages: session ? session.messages : [],
          };
        }),

      clearAllSessions: () => {
        _base64Cache.clear();
        const id = Date.now().toString();
        const newSession: ChatSession = {
          id,
          title: "New Chat",
          messages: [],
          createdAt: Date.now(),
        };
        set({
          sessions: [newSession],
          currentSessionId: id,
          messages: [],
        });
      },

      addMessage: (message) =>
        set((state) => {
          let activeId = state.currentSessionId;
          let sessions = [...state.sessions];

          if (!activeId) {
            activeId = Date.now().toString();
            const newSession: ChatSession = {
              id: activeId,
              title:
                message.role === "user"
                  ? message.content.slice(0, 20) || "New Chat"
                  : "New Chat",
              messages: [],
              createdAt: Date.now(),
            };
            sessions = [newSession];
          }

          const updatedSessions = sessions.map((s) => {
            if (s.id === activeId) {
              let newTitle = s.title;
              if (
                message.role === "user" &&
                s.messages.length === 0 &&
                (s.title === "New Chat" || s.title === "Default Chat")
              ) {
                newTitle = message.content.slice(0, 16) || "New Chat";
              }
              return {
                ...s,
                title: newTitle,
                messages: [...s.messages, message],
              };
            }
            return s;
          });

          const currentSession = updatedSessions.find((s) => s.id === activeId);
          return {
            sessions: updatedSessions,
            currentSessionId: activeId,
            messages: currentSession ? currentSession.messages : [],
          };
        }),

      updateLastAssistantMessage: (content) =>
        set((state) => {
          const activeId = state.currentSessionId;
          if (!activeId) return {};

          const updatedSessions = state.sessions.map((s) => {
            if (s.id === activeId) {
              const msgs = [...s.messages];
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                msgs[msgs.length - 1] = { ...lastMsg, content };
              }
              return { ...s, messages: msgs };
            }
            return s;
          });

          const currentSession = updatedSessions.find((s) => s.id === activeId);
          return {
            sessions: updatedSessions,
            messages: currentSession ? currentSession.messages : [],
          };
        }),

      updateLastAssistantThinking: (thinking) =>
        set((state) => {
          const activeId = state.currentSessionId;
          if (!activeId) return {};

          const updatedSessions = state.sessions.map((s) => {
            if (s.id === activeId) {
              const msgs = [...s.messages];
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                msgs[msgs.length - 1] = { ...lastMsg, thinking };
              }
              return { ...s, messages: msgs };
            }
            return s;
          });

          const currentSession = updatedSessions.find((s) => s.id === activeId);
          return {
            sessions: updatedSessions,
            messages: currentSession ? currentSession.messages : [],
          };
        }),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      deleteSingleMessage: (id) => {
        _base64Cache.delete(id);
        set((state) => {
          const activeId = state.currentSessionId;
          if (!activeId) return {};

          const updatedSessions = state.sessions.map((s) => {
            if (s.id === activeId) {
              return { ...s, messages: s.messages.filter((m) => m.id !== id) };
            }
            return s;
          });

          const currentSession = updatedSessions.find((s) => s.id === activeId);
          return {
            sessions: updatedSessions,
            messages: currentSession ? currentSession.messages : [],
          };
        });
      },

      removeLastMessage: () =>
        set((state) => {
          const activeId = state.currentSessionId;
          if (!activeId) return {};

          const updatedSessions = state.sessions.map((s) => {
            if (s.id === activeId) {
              return { ...s, messages: s.messages.slice(0, -1) };
            }
            return s;
          });

          const currentSession = updatedSessions.find((s) => s.id === activeId);
          return {
            sessions: updatedSessions,
            messages: currentSession ? currentSession.messages : [],
          };
        }),

      editUserMessage: (id, newContent) =>
        set((state) => {
          const activeId = state.currentSessionId;
          if (!activeId) return {};

          const updatedSessions = state.sessions.map((s) => {
            if (s.id === activeId) {
              const idx = s.messages.findIndex((m) => m.id === id);
              if (idx !== -1) {
                const sliced = s.messages.slice(0, idx + 1);
                sliced[idx] = { ...sliced[idx], content: newContent };
                return { ...s, messages: sliced };
              }
            }
            return s;
          });

          const currentSession = updatedSessions.find((s) => s.id === activeId);
          return {
            sessions: updatedSessions,
            messages: currentSession ? currentSession.messages : [],
          };
        }),

      clearMessages: () =>
        set((state) => {
          const activeId = state.currentSessionId;
          if (!activeId) return {};

          const updatedSessions = state.sessions.map((s) => {
            if (s.id === activeId) {
              s.messages.forEach((m) => _base64Cache.delete(m.id));
              return { ...s, messages: [] };
            }
            return s;
          });

          return {
            sessions: updatedSessions,
            messages: [],
          };
        }),

      cacheImagesBase64: (messageId, base64Array) => {
        _base64Cache.set(messageId, base64Array);
      },

      getCachedImagesBase64: (messageId) => {
        return _base64Cache.get(messageId);
      },
    }),
    {
      name: "chat-sessions",
      storage: createJSONStorage(() => mmkvStorage),
      // 过滤只保存 sessions 和 currentSessionId,
      // 深拷贝并剥离 imagesBase64（太大，不能存入 MMKV）
      partialize: (state) => {
        const strippedSessions = state.sessions.map((s) => ({
          ...s,
          messages: s.messages.map(({ imagesBase64, ...rest }) => rest),
        }));
        return {
          sessions: strippedSessions,
          currentSessionId: state.currentSessionId,
        };
      },
      // 在本地存储恢复完之后，手动把顶层 messages 初始化为当前选中的 session messages
      onRehydrateStorage: () => (state) => {
        if (state) {
          const activeSession = state.sessions.find(
            (s) => s.id === state.currentSessionId,
          );
          state.messages = activeSession ? activeSession.messages : [];
        }
      },
    },
  ),
);
