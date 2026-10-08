import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system", "health"],
    queryFn: () => getApiClient().system.health(),
  });
}
