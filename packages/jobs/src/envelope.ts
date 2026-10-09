import { z } from "zod";

export const jobEnvelopeSchema = z
  .object({
    id: z.uuid(),
    type: z.string().min(1),
    version: z.number().int().positive(),
    payload: z.json(),
  })
  .strict();

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;
