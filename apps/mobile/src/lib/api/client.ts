import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract } from "@unimate/contracts";
import { resolveApiBaseUrl } from "./base-url";

const link = new OpenAPILink(contract, {
  url: resolveApiBaseUrl(),
});

export const apiClient =
  createORPCClient<ContractRouterClient<typeof contract>>(link);
