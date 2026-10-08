import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { createSecureSessionStorage } from "./secure-session-storage";
import { resolveSupabaseUrl } from "./supabase-url";

const storageKey = "unimate-auth-session";

const browserStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === "undefined") {
      throw new Error("Browser authentication storage is unavailable.");
    }

    return window.localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("Browser authentication storage is unavailable.");
    }

    window.localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("Browser authentication storage is unavailable.");
    }

    window.localStorage.removeItem(key);
  },
};

const nativeStorage = createSecureSessionStorage(SecureStore, storageKey);

let supabaseClient: ReturnType<typeof createClient> | undefined;

export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (supabaseClient) {
    return supabaseClient;
  }

  const publishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!publishableKey?.startsWith("sb_publishable_")) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must contain a Supabase publishable key.",
    );
  }

  supabaseClient = createClient(resolveSupabaseUrl(), publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === "web",
      persistSession: true,
      storage: Platform.OS === "web" ? browserStorage : nativeStorage,
      storageKey,
    },
  });

  return supabaseClient;
}

let currentAccessToken: string | null = null;

export function setCurrentAccessToken(accessToken: string | null): void {
  currentAccessToken = accessToken;
}

export function getCurrentAccessToken(): string | null {
  return currentAccessToken;
}
