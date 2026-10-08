import { oc } from "@orpc/contract";
import { z } from "zod";

export const systemHealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("unimate-api"),
    apiVersion: z.literal("v1"),
  })
  .strict();

export type SystemHealthResponse = z.infer<typeof systemHealthResponseSchema>;

export const systemHealthContract = oc
  .route({
    method: "GET",
    path: "/v1/system/health",
    summary: "Public system health",
    description: "PUBLIC foundation health operation. No identity is required.",
    tags: ["System"],
  })
  .output(systemHealthResponseSchema);
