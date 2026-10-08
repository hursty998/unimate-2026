import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { authMeQueryKey } from "@/features/auth/auth-me-query-key";
import { getSupabaseClient, setCurrentAccessToken } from "./supabase-client";

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabaseClient = getSupabaseClient();
    let currentProviderUserId: string | null = null;
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      const nextProviderUserId = nextSession?.user.id ?? null;

      if (currentProviderUserId !== nextProviderUserId) {
        queryClient.removeQueries({ queryKey: authMeQueryKey });
        currentProviderUserId = nextProviderUserId;
      }

      setCurrentAccessToken(nextSession?.access_token ?? null);
      setSession(nextSession);
      setIsLoading(false);
    });

    const appStateSubscription =
      Platform.OS === "web"
        ? null
        : AppState.addEventListener("change", (state) => {
            if (state === "active") {
              void supabaseClient.auth.startAutoRefresh();
            } else {
              void supabaseClient.auth.stopAutoRefresh();
            }
          });

    if (Platform.OS !== "web") {
      if (AppState.currentState === "active") {
        void supabaseClient.auth.startAutoRefresh();
      } else {
        void supabaseClient.auth.stopAutoRefresh();
      }
    }

    return () => {
      subscription.unsubscribe();
      appStateSubscription?.remove();

      if (Platform.OS !== "web") {
        void supabaseClient.auth.stopAutoRefresh();
      }
    };
  }, [queryClient]);

  async function signIn(email: string, password: string): Promise<void> {
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new Error("Sign in failed. Check the email and password.");
    }
  }

  async function signUp(email: string, password: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new Error("Sign up failed. Check the details and try again.");
    }

    return data.session !== null;
  }

  async function signOut(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut();

    if (error) {
      throw new Error("Sign out failed. Please try again.");
    }
  }

  return (
    <AuthContext.Provider
      value={{ session, isLoading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
