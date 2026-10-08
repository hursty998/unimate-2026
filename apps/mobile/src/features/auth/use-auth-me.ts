import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import { authMeQueryKey } from "./auth-me-query-key";

export function useAuthMe() {
  const { isLoading, session } = useAuth();

  return useQuery({
    queryKey: authMeQueryKey,
    queryFn: () => getApiClient().auth.me(),
    enabled: !isLoading && session !== null,
  });
}
