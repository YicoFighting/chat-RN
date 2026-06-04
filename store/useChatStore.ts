import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  imageBase64?: string;
  createdAt: number;
}

export interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  addMessage: (message: Message) => void;
  updateLastAssistantMessage: (content: string) => void;
  updateLastAssistantThinking: (thinking: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateLastAssistantMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        messages[messages.length - 1] = { ...lastMsg, content };
      }
      return { messages };
    }),
  updateLastAssistantThinking: (thinking) =>
    set((state) => {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        messages[messages.length - 1] = { ...lastMsg, thinking };
      }
      return { messages };
    }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearMessages: () => set({ messages: [] }),
}));
