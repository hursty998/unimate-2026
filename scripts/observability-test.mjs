import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { Writable } from "node:stream";
import { URL, fileURLToPath } from "node:url";
import path from "node:path";
import { withSupabaseTestQueue } from "../packages/queue/.test-dist/supabase-test-support.js";
import { createApiApplication } from "../apps/api/dist/app.js";
import { parseApiConfig } from "../apps/api/dist/config/environment.js";
import { DatabaseClientService } from "../apps/api/dist/infrastructure/database/database.module.js";
import { startNodeObservabilityRuntime } from "../packages/observability/dist/node/index.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prepared = process.argv.includes("--prepared");
let stage = "checking local Supabase";

function run(command, arguments_, environment, timeout = 60_000) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    env: environment,
    encoding: "utf8",
    timeout,
    maxBuffer: 2 * 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    throw new Error("A local observability test command failed.");
  }

  return result.stdout;
}

function isLoopback(url) {
  const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function parseStructuredLogs(lines) {
  const records = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (
        record &&
        typeof record === "object" &&
        typeof record.event === "string"
      ) {
        records.push(record);
      }
    } catch {
      throw new Error("An observability log line was not valid JSON.");
    }
  }

  return records;
}

function findRecord(records, event, predicate = () => true) {
  const record = records.find(
    (candidate) => candidate.event === event && predicate(candidate),
  );
  assert.ok(record, `Expected structured event ${event}.`);
  return record;
}

async function createLocalAuthUser(apiUrl, secretKey, publishableKey) {
  const email = `phase11-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const response = await globalThis.fetch(
    new URL("/auth/v1/admin/users", apiUrl),
    {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Local Auth user creation returned HTTP ${response.status}.`,
    );
  }

  const user = await response.json();
  if (typeof user?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) {
    throw new Error("Local Auth returned an invalid user identifier.");
  }

  const signIn = await globalThis.fetch(
    new URL("/auth/v1/token?grant_type=password", apiUrl),
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!signIn.ok) {
    await deleteLocalAuthUser(apiUrl, secretKey, user.id);
    throw new Error(`Local Auth sign-in returned HTTP ${signIn.status}.`);
  }

  const session = await signIn.json();
  if (typeof session?.access_token !== "string") {
    await deleteLocalAuthUser(apiUrl, secretKey, user.id);
    throw new Error("Local Auth returned an invalid access token.");
  }

  return {
    id: user.id,
    accessToken: session.access_token,
    password,
  };
}

async function deleteLocalAuthUser(apiUrl, secretKey, userId) {
  const response = await globalThis.fetch(
    new URL(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, apiUrl),
    {
      method: "DELETE",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Local Auth user cleanup returned HTTP ${response.status}.`,
    );
  }
}

function traceparentParts(traceparent) {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-0[01]$/.exec(traceparent);
  assert.ok(match, "Outbox did not persist a valid W3C traceparent.");
  return { traceId: match[1], spanId: match[2] };
}

async function main() {
  let localStatus;
  try {
    localStatus = JSON.parse(
      run("supabase", ["status", "-o", "json"], process.env, 20_000),
    );
  } catch {
    throw new Error("Local Supabase must be running for observability:test.");
  }

  const databaseUrl = new URL(localStatus.DB_URL);
  const apiUrl = new URL(localStatus.API_URL);
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !isLoopback(databaseUrl) ||
    !["http:", "https:"].includes(apiUrl.protocol) ||
    !isLoopback(apiUrl)
  ) {
    throw new Error(
      "Observability integration is restricted to local services.",
    );
  }

  const secretKey = localStatus.SECRET_KEY ?? localStatus.SERVICE_ROLE_KEY;
  const publishableKey = localStatus.PUBLISHABLE_KEY ?? localStatus.ANON_KEY;
  if (
    typeof secretKey !== "string" ||
    typeof publishableKey !== "string" ||
    secretKey.length === 0 ||
    publishableKey.length === 0
  ) {
    throw new Error("Local Supabase Auth credentials are unavailable.");
  }

  const appDatabaseUrl = new URL(databaseUrl);
  appDatabaseUrl.searchParams.set("schema", "app");
  const localEnvironment = {
    ...process.env,
    DATABASE_URL: appDatabaseUrl.toString(),
    DIRECT_URL: appDatabaseUrl.toString(),
    QUEUE_DATABASE_URL: databaseUrl.toString(),
    SUPABASE_URL: apiUrl.origin,
    SUPABASE_SECRET_KEY: secretKey,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };

  if (!prepared) {
    stage = "applying local Prisma migrations";
    run(
      "pnpm",
      ["--filter", "@unimate/database", "migrate:deploy"],
      localEnvironment,
    );
  }
  stage = "checking local Prisma migration status";
  run(
    "pnpm",
    ["--filter", "@unimate/database", "migrate:status"],
    localEnvironment,
  );

  const configuration = parseApiConfig({
    ...localEnvironment,
    API_HOST: "127.0.0.1",
    API_PORT: "3000",
    NODE_ENV: "test",
    SUPABASE_STORAGE_BUCKET: "foundation-storage-proof",
    OBSERVABILITY_LOG_LEVEL: "info",
    OBSERVABILITY_TRACE_EXPORTER: "none",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
    DATABASE_SLOW_QUERY_THRESHOLD_MS: "250",
  });
  const apiLogLines = [];
  const apiLogDestination = new Writable({
    write(chunk, _encoding, callback) {
      apiLogLines.push(String(chunk));
      callback();
    },
  });
  const observability = startNodeObservabilityRuntime({
    serviceName: "unimate-api",
    config: configuration.observability,
    destination: apiLogDestination,
  });
  let app;
  let database;
  let authUser;
  let correlationId;
  let queueEvidence;
  let proofResponseBody;
  let operationFailed = false;
  let operationFailure;
  const cleanupErrors = [];

  try {
    app = await createApiApplication(configuration, {}, observability);
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    database = app.get(DatabaseClientService, { strict: false });

    const liveness = await globalThis.fetch(
      new URL("/v1/system/health", baseUrl),
    );
    assert.equal(liveness.status, 200);
    assert.deepEqual(await liveness.json(), {
      status: "ok",
      service: "unimate-api",
      apiVersion: "v1",
    });
    const readiness = await globalThis.fetch(
      new URL("/v1/system/readiness", baseUrl),
    );
    assert.equal(readiness.status, 200);
    assert.deepEqual(await readiness.json(), { status: "ready" });

    const pendingOutboxCount = await database.client.outboxMessage.count({
      where: { publishedAt: null },
    });
    if (pendingOutboxCount !== 0) {
      throw new Error(
        "The local proof requires no unrelated unpublished Outbox rows.",
      );
    }

    stage = "creating a local authenticated test identity";
    authUser = await createLocalAuthUser(
      apiUrl.origin,
      secretKey,
      publishableKey,
    );

    stage = "calling the authenticated proof operation";
    const response = await globalThis.fetch(
      new URL("/v1/foundation/observability-proof", baseUrl),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authUser.accessToken}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    correlationId = response.headers.get("x-correlation-id") ?? undefined;
    const requestId = response.headers.get("x-request-id");
    if (!response.ok) {
      throw new Error(`Foundation proof returned HTTP ${response.status}.`);
    }

    if (!correlationId || !requestId || correlationId !== requestId) {
      throw new Error("The proof response did not return request lineage.");
    }
    proofResponseBody = await response.json();
    if (
      proofResponseBody.jobId !== proofResponseBody.outboxId ||
      typeof proofResponseBody.taskId !== "string"
    ) {
      throw new Error("The proof response returned invalid safe identifiers.");
    }

    const task = await database.client.foundationAsyncTask.findUnique({
      where: { id: proofResponseBody.taskId },
    });
    const outbox = await database.client.outboxMessage.findUnique({
      where: { id: proofResponseBody.outboxId },
    });
    if (
      !task ||
      !outbox ||
      outbox.correlationId !== correlationId ||
      outbox.traceparent === null ||
      outbox.publishedAt !== null
    ) {
      throw new Error("The request did not persist expected Outbox lineage.");
    }
    const payload =
      outbox.payload && typeof outbox.payload === "object"
        ? outbox.payload
        : undefined;
    if (payload?.taskId !== task.id) {
      throw new Error("The Outbox payload does not reference the proof task.");
    }

    await observability.logger.flush?.();
    const apiRecords = parseStructuredLogs(apiLogLines);
    assert.equal(
      apiRecords.some(
        (record) =>
          record.event === "http.request.completed" &&
          ["/v1/system/health", "/v1/system/readiness"].includes(record.route),
      ),
      false,
    );
    const requestLog = findRecord(
      apiRecords,
      "http.request.completed",
      (record) =>
        record.route === "/v1/foundation/observability-proof" &&
        record.request_id === requestId,
    );
    const origin = traceparentParts(outbox.traceparent);
    assert.equal(requestLog.correlation_id, correlationId);
    assert.equal(requestLog.trace_id, origin.traceId);
    assert.equal(requestLog.span_id, origin.spanId);

    const queueName = `observability_${randomUUID().replaceAll("-", "")}`;
    stage = "dispatching and processing the proof with local PGMQ";
    const workerOutput = await withSupabaseTestQueue(
      {
        connectionString: databaseUrl.toString(),
        queueName,
        timeoutMilliseconds: 10_000,
      },
      async () => {
        const workerEnvironment = {
          ...localEnvironment,
          NODE_ENV: "test",
          DATABASE_URL: appDatabaseUrl.toString(),
          QUEUE_DATABASE_URL: databaseUrl.toString(),
          QUEUE_NAME: queueName,
          QUEUE_VISIBILITY_TIMEOUT_SECONDS: "30",
          WORKER_BATCH_SIZE: "1",
          WORKER_MAX_DELIVERY_ATTEMPTS: "5",
          WORKER_POLL_INTERVAL_MS: "100",
          FOUNDATION_PUSH_RECEIPT_CHECK_DELAY_SECONDS: "900",
          OBSERVABILITY_LOG_LEVEL: "info",
          OBSERVABILITY_TRACE_EXPORTER: "none",
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
          DATABASE_SLOW_QUERY_THRESHOLD_MS: "250",
        };
        const worker = spawnSync(
          process.execPath,
          [path.join(repositoryRoot, "apps/worker/dist/main.js"), "--once"],
          {
            cwd: repositoryRoot,
            env: workerEnvironment,
            encoding: "utf8",
            timeout: 30_000,
            maxBuffer: 2 * 1024 * 1024,
          },
        );
        if (worker.error || worker.status !== 0) {
          throw new Error("The local worker --once process failed.");
        }
        return worker.stdout;
      },
    );

    const workerRecords = parseStructuredLogs(workerOutput.split(/\r?\n/));
    const operationalLogs = `${apiLogLines.join("")}\n${workerOutput}`;
    for (const sensitiveValue of [
      secretKey,
      publishableKey,
      databaseUrl.toString(),
      appDatabaseUrl.toString(),
      authUser.accessToken,
      authUser.password,
    ]) {
      if (operationalLogs.includes(sensitiveValue)) {
        throw new Error("A local secret appeared in observability output.");
      }
    }

    const dispatchLog = findRecord(
      workerRecords,
      "outbox.dispatch.completed",
      (record) => record.outbox_id === proofResponseBody.outboxId,
    );
    const jobLog = findRecord(
      workerRecords,
      "job.processing.completed",
      (record) => record.job_id === proofResponseBody.jobId,
    );
    const cycleLog = findRecord(workerRecords, "worker.cycle.completed");

    assert.equal(dispatchLog.correlation_id, correlationId);
    assert.equal(dispatchLog.trace_id, origin.traceId);
    assert.equal(dispatchLog.job_id, proofResponseBody.jobId);
    assert.equal(typeof dispatchLog.queue_message_id, "string");
    assert.equal(jobLog.correlation_id, correlationId);
    assert.equal(jobLog.trace_id, origin.traceId);
    assert.equal(jobLog.job_id, proofResponseBody.jobId);
    assert.equal(jobLog.queue_message_id, dispatchLog.queue_message_id);
    assert.equal(jobLog.delivery_count, 1);
    assert.notEqual(dispatchLog.span_id, origin.spanId);
    assert.notEqual(jobLog.span_id, dispatchLog.span_id);
    assert.equal(cycleLog.dispatched, 1);
    assert.equal(cycleLog.received, 1);
    assert.equal(cycleLog.acknowledged, 1);

    const completedTask = await database.client.foundationAsyncTask.findUnique({
      where: { id: proofResponseBody.taskId },
    });
    const publishedOutbox = await database.client.outboxMessage.findUnique({
      where: { id: proofResponseBody.outboxId },
    });
    if (!completedTask?.completedAt || !publishedOutbox?.publishedAt) {
      throw new Error("The worker did not complete the proof task.");
    }

    queueEvidence = {
      requestId,
      correlationId,
      traceId: origin.traceId,
      taskId: proofResponseBody.taskId,
      outboxId: proofResponseBody.outboxId,
      jobId: proofResponseBody.jobId,
      queueMessageId: dispatchLog.queue_message_id,
      events: [
        requestLog.event,
        dispatchLog.event,
        jobLog.event,
        cycleLog.event,
      ],
    };
  } catch (error) {
    operationFailed = true;
    operationFailure = error;
  } finally {
    if (database && correlationId) {
      try {
        const rows = await database.client.outboxMessage.findMany({
          where: { correlationId },
          select: { id: true, payload: true },
        });
        const taskIds = rows.flatMap((row) => {
          const payload =
            row.payload && typeof row.payload === "object"
              ? row.payload
              : undefined;
          return typeof payload?.taskId === "string" ? [payload.taskId] : [];
        });
        if (taskIds.length > 0) {
          await database.client.foundationAsyncTask.deleteMany({
            where: { id: { in: taskIds } },
          });
        }
        await database.client.outboxMessage.deleteMany({
          where: { id: { in: rows.map((row) => row.id) } },
        });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (app) {
      try {
        await app.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    } else {
      try {
        await observability.shutdown();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (authUser) {
      try {
        await deleteLocalAuthUser(apiUrl.origin, secretKey, authUser.id);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (operationFailed && cleanupErrors.length > 0) {
    throw new AggregateError(
      [operationFailure, ...cleanupErrors],
      "Local observability proof and cleanup both failed.",
    );
  }
  if (operationFailed) {
    throw operationFailure;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Local observability proof cleanup failed.",
    );
  }

  if (!queueEvidence) {
    throw new Error("The local observability proof did not complete.");
  }
  process.stdout.write(
    `${JSON.stringify({
      event: "observability.integration.passed",
      ...queueEvidence,
    })}\n`,
  );
}

main().catch((error) => {
  const errorType =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(error.name)
      ? error.name
      : "Error";
  process.stderr.write(
    `observability.integration.failed stage="${stage}" error_type="${errorType}"\n`,
  );
  process.exitCode = 1;
});
