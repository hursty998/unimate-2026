import { randomUUID } from "node:crypto";
import { jobEnvelopeSchema } from "@unimate/jobs";
import type {
  ExecutionContextProvider,
  TelemetryProvider,
} from "@unimate/observability";
import type {
  JobQueue,
  QueueMessageId,
  ReceivedQueueMessage,
  JsonValue,
} from "@unimate/queue";
import { z } from "zod";

type ClosableJobQueue = JobQueue & {
  close(): Promise<void>;
};

export class ContextualJobQueue implements JobQueue {
  constructor(
    private readonly queue: ClosableJobQueue,
    private readonly executionContext: ExecutionContextProvider,
    private readonly telemetry: Pick<
      TelemetryProvider,
      "capturePropagationContext"
    >,
  ) {}

  async enqueue(
    payload: JsonValue,
    options?: { readonly delaySeconds?: number },
  ): Promise<QueueMessageId> {
    const envelope = jobEnvelopeSchema.safeParse(payload);
    if (!envelope.success || envelope.data.observability) {
      return this.queue.enqueue(payload, options);
    }

    const correlationId =
      this.executionContext.current()?.correlationId ?? randomUUID();
    const propagationContext = this.telemetry.capturePropagationContext();
    const enrichedEnvelope = jobEnvelopeSchema.parse({
      ...envelope.data,
      observability: {
        correlationId,
        ...(propagationContext
          ? {
              traceparent: propagationContext.traceparent,
              ...(propagationContext.tracestate
                ? { tracestate: propagationContext.tracestate }
                : {}),
            }
          : {}),
      },
    });

    return this.queue.enqueue(z.json().parse(enrichedEnvelope), options);
  }

  receive(options: {
    visibilityTimeoutSeconds: number;
    limit: number;
  }): Promise<readonly ReceivedQueueMessage[]> {
    return this.queue.receive(options);
  }

  acknowledge(messageId: QueueMessageId): Promise<boolean> {
    return this.queue.acknowledge(messageId);
  }

  deadLetter(messageId: QueueMessageId): Promise<boolean> {
    return this.queue.deadLetter(messageId);
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}
