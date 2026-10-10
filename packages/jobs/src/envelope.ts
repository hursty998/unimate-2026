import { z } from "zod";

const traceparentSchema = z
  .string()
  .regex(/^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-0[01]$/);

const observabilityMetadataSchema = z
  .object({
    correlationId: z.uuid(),
    traceparent: traceparentSchema.optional(),
    tracestate: z.string().max(512).optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    if (
      metadata.tracestate !== undefined &&
      metadata.traceparent === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["tracestate"],
        message: "tracestate requires traceparent.",
      });
    }
  });

export const jobEnvelopeSchema = z
  .object({
    id: z.uuid(),
    type: z.string().min(1),
    version: z.number().int().positive(),
    payload: z.json(),
    observability: observabilityMetadataSchema.optional(),
  })
  .strict();

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;
