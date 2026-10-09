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

export interface JobHandlerRegistry {
  resolve(type: string, version: number): RegisteredJobHandler;
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

export function createJobHandlerRegistry(
  handlers: readonly RegisteredJobHandler[],
): JobHandlerRegistry {
  const byTypeAndVersion = new Map<string, Map<number, RegisteredJobHandler>>();

  for (const handler of handlers) {
    if (
      handler.type.length === 0 ||
      !Number.isSafeInteger(handler.version) ||
      handler.version < 1
    ) {
      throw new TypeError("Job handler type and version must be valid.");
    }

    let versions = byTypeAndVersion.get(handler.type);
    if (versions === undefined) {
      versions = new Map();
      byTypeAndVersion.set(handler.type, versions);
    }

    if (versions.has(handler.version)) {
      throw new TypeError(
        "Duplicate job handler registration for type and version.",
      );
    }

    versions.set(handler.version, handler);
  }

  return Object.freeze({
    resolve(type: string, version: number): RegisteredJobHandler {
      const handler = byTypeAndVersion.get(type)?.get(version);

      if (handler === undefined) {
        throw new PermanentJobError(
          "No handler supports this job type/version.",
        );
      }

      return handler;
    },
  });
}
