import i18n from "@/utils/i18n";
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
    // Fallback to in-memory storage if MMKV fails to load
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

export type Provider = "openai" | "anthropic" | "deepseek" | "custom";
export type Language = "en" | "zh";

export interface SettingState {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  language: Language;
  setSettings: (settings: Partial<Omit<SettingState, "setSettings">>) => void;
  setLanguage: (language: Language) => void;
}

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
      provider: "custom",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      apiKey: "tp-cwoi2objs51ebhulfkjokikgokucjb7zpgbwr88d9uj2u9x8",
      model: "mimo-v2.5",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 128 * 1024, // 128k
      language: "zh" as Language,
      setSettings: (newSettings) =>
        set((state) => {
          const processed = { ...newSettings };
          if (typeof processed.apiKey === "string") {
            processed.apiKey = processed.apiKey.replace(/\r?\n|\r/g, "").trim();
          }
          if (typeof processed.baseUrl === "string") {
            processed.baseUrl = processed.baseUrl.trim();
          }
          return { ...state, ...processed };
        }),
      setLanguage: (language: Language) => {
        set({ language });
        i18n.changeLanguage(language);
      },
    }),
    {
      name: "app-settings",
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (state) => {
        // When storage is rehydrated, sync the language to i18n
        if (state?.language) {
          i18n.changeLanguage(state.language);
        }
      },
    },
  ),
);
