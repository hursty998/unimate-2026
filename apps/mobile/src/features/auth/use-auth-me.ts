import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import { authMeQueryKey } from "./auth-me-query-key";

export function useAuthMe() {
  const { isLoading, session } = useAuth();

  return useQuery({
    queryKey: authMeQueryKey,
    queryFn: () => apiClient.auth.me(),
    enabled: !isLoading && session !== null,
  });
}
