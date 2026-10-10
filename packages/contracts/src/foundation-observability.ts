import { oc } from "@orpc/contract";
import { z } from "zod";

export const foundationObservabilityProofInputSchema = z.object({}).strict();

export const foundationObservabilityProofResponseSchema = z
  .object({
    taskId: z.uuid(),
    outboxId: z.uuid(),
    jobId: z.uuid(),
  })
  .strict();

export const foundationObservabilityProofContract = oc
  .route({
    method: "POST",
    path: "/v1/foundation/observability-proof",
    summary: "Queue a synthetic observability proof",
    description:
      "AUTHENTICATED. Development/test only. Queues the existing foundation task job to prove API-to-worker lineage.",
    tags: ["Foundation"],
  })
  .input(foundationObservabilityProofInputSchema)
  .output(foundationObservabilityProofResponseSchema);
