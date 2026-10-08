import pg from "pg";
import type { JobQueue } from "./index.js";
import { SupabaseJobQueue, type SupabaseJobQueueOptions } from "./supabase.js";

export async function withSupabaseTestQueue<T>(
  options: SupabaseJobQueueOptions,
  run: (queue: JobQueue) => Promise<T>,
): Promise<T> {
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
  const admin = new pg.Pool({
    connectionString: options.connectionString,
    max: 1,
    connectionTimeoutMillis: timeoutMilliseconds,
    query_timeout: timeoutMilliseconds,
    statement_timeout: timeoutMilliseconds,
  });
  const queue = new SupabaseJobQueue(options);
  let queueCreated = false;
  let operationFailed = false;
  let operationFailure: unknown;
  let operationResult: { value: T } | undefined;
  const cleanupErrors: unknown[] = [];

  try {
    await admin.query("select pgmq.create($1::text)", [options.queueName]);
    queueCreated = true;
    operationResult = { value: await run(queue) };
  } catch (error) {
    operationFailed = true;
    operationFailure = error;
  }

  try {
    await queue.close();
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (queueCreated) {
    try {
      const result = await admin.query<{ dropped: boolean }>(
        "select pgmq.drop_queue($1::text) as dropped",
        [options.queueName],
      );

      if (result.rows[0]?.dropped !== true) {
        cleanupErrors.push(
          new Error("The local Supabase test queue was not removed."),
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  try {
    await admin.end();
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (operationFailed && cleanupErrors.length > 0) {
    throw new AggregateError(
      [operationFailure, ...cleanupErrors],
      "Supabase queue test operation and cleanup both failed.",
    );
  }

  if (operationFailed) {
    throw operationFailure;
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Supabase queue test cleanup failed.",
    );
  }

  if (operationResult === undefined) {
    throw new Error("The Supabase queue test did not complete.");
  }

  return operationResult.value;
}
