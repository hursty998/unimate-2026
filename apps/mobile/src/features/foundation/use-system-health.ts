import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system", "health"],
    queryFn: () => apiClient.system.health(),
  });
}
