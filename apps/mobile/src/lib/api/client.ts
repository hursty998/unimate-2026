import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract } from "@unimate/contracts";
import { getCurrentAccessToken } from "@/lib/auth/supabase-client";
import { resolveApiBaseUrl } from "./base-url";

type ApiClient = ContractRouterClient<typeof contract>;

const authenticatedFetch = async (
  request: Request,
  init: { redirect?: Request["redirect"] },
): Promise<Response> => {
  const headers = new Headers(request.headers);
  const accessToken = getCurrentAccessToken();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    headers.delete("Authorization");
  }

  return fetch(new Request(request, { ...init, headers }));
};

let apiClient: ApiClient | undefined;

export function getApiClient(): ApiClient {
  if (!apiClient) {
    const link = new OpenAPILink(contract, {
      url: resolveApiBaseUrl(),
      fetch: authenticatedFetch,
    });

    apiClient = createORPCClient<ApiClient>(link);
  }

  return apiClient;
}
