import type { JsonValue } from "@unimate/queue";
import type { ZodType } from "zod";
import { PermanentJobError } from "./permanent-job-error.js";

export interface JobInvocation {
  readonly id: string;
  readonly payload: JsonValue;
}

export interface RegisteredJobHandler {
  readonly type: string;
  readonly version: number;
  handle(invocation: JobInvocation): Promise<void>;
}

export function registerJobHandler<Payload>({
  type,
  version,
  payloadSchema,
  handle,
}: {
  readonly type: string;
  readonly version: number;
  readonly payloadSchema: ZodType<Payload>;
  readonly handle: (input: {
    readonly id: string;
    readonly payload: Payload;
  }) => Promise<void>;
}): RegisteredJobHandler {
  return {
    type,
    version,
    async handle(invocation) {
      const result = payloadSchema.safeParse(invocation.payload);

      if (!result.success) {
        throw new PermanentJobError("Job payload validation failed.");
      }

      await handle({ id: invocation.id, payload: result.data });
    },
  };
}

export function resolveJobHandler(
  handlers: readonly RegisteredJobHandler[],
  type: string,
  version: number,
): RegisteredJobHandler {
  const handler = handlers.find(
    (entry) => entry.type === type && entry.version === version,
  );

  if (handler === undefined) {
    throw new PermanentJobError("No handler supports this job type/version.");
  }

  return handler;
}
