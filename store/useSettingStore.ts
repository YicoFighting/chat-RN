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

export interface SettingState {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  setSettings: (settings: Partial<Omit<SettingState, "setSettings">>) => void;
}

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o",
      setSettings: (newSettings) =>
        set((state) => ({ ...state, ...newSettings })),
    }),
    {
      name: "app-settings",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
