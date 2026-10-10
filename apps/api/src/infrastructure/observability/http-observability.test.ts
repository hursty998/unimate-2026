import assert from "node:assert/strict";
import { Writable } from "node:stream";
import type { AuthMeResponse } from "@unimate/contracts";
import { test } from "node:test";
import { createApiApplication } from "../../app.js";
import { parseApiConfig } from "../../config/environment.js";
import type { AuthMeService } from "../../modules/auth/auth-me.service.js";
import { startNodeObservabilityRuntime } from "@unimate/observability/node";

test(
  "isolates request context and records safe logs/spans for success and failure",
  { timeout: 30_000 },
  async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const config = parseApiConfig({
      NODE_ENV: "test",
      API_HOST: "127.0.0.1",
      DATABASE_URL: "postgresql://127.0.0.1:1/postgres?schema=app",
      SUPABASE_URL: "http://127.0.0.1:55321",
      SUPABASE_SECRET_KEY: "sb_secret_test-only",
      SUPABASE_STORAGE_BUCKET: "foundation-storage-proof",
      OBSERVABILITY_LOG_LEVEL: "info",
    });
    const observability = startNodeObservabilityRuntime({
      serviceName: "unimate-api-test",
      config: config.observability,
      destination,
    });
    const expectedUser: AuthMeResponse = {
      user: { id: "f0000000-0000-7000-8000-000000000001" },
      universityAffiliations: [],
    };
    let concurrentRequests = 0;
    let releaseConcurrentRequests!: () => void;
    const bothRequests = new Promise<void>((resolve) => {
      releaseConcurrentRequests = resolve;
    });
    const app = await createApiApplication(
      config,
      {
        tokenVerifier: {
          async verify(token) {
            return { provider: "SUPABASE", providerSubject: token };
          },
        },
        authMeService: {
          async getMe(principal) {
            observability.logger.info("test.auth.me.operation");
            if (principal.providerSubject === "synthetic-failure") {
              throw new Error("synthetic private database failure");
            }
            concurrentRequests += 1;
            if (concurrentRequests === 2) releaseConcurrentRequests();
            await bothRequests;
            return expectedUser;
          },
        } satisfies Pick<AuthMeService, "getMe">,
      },
      observability,
    );

    try {
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address();
      assert.ok(address && typeof address === "object");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const concurrentResponses = await Promise.all(
        ["synthetic-bearer-a", "synthetic-bearer-b"].map((token) =>
          fetch(`${baseUrl}/v1/auth/me?token=synthetic-query-secret`, {
            headers: {
              authorization: `Bearer ${token}`,
              "x-request-id": "caller-controlled-request-id",
              "x-correlation-id": "caller-controlled-correlation-id",
            },
          }),
        ),
      );

      for (const response of concurrentResponses) {
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), expectedUser);
        assert.match(
          response.headers.get("x-request-id") ?? "",
          /^[0-9a-f-]{36}$/,
        );
        assert.equal(
          response.headers.get("x-correlation-id"),
          response.headers.get("x-request-id"),
        );
        assert.notEqual(
          response.headers.get("x-request-id"),
          "caller-controlled-request-id",
        );
      }

      const failureResponse = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: { authorization: "Bearer synthetic-failure" },
      });
      const failedRequestId = failureResponse.headers.get("x-request-id");
      assert.equal(failureResponse.status, 500);
      assert.match(failedRequestId ?? "", /^[0-9a-f-]{36}$/);
      assert.equal(
        JSON.stringify(await failureResponse.json()).includes(
          "synthetic private database failure",
        ),
        false,
      );
      const unmatchedResponse = await fetch(
        `${baseUrl}/synthetic-unmatched?token=synthetic-unmatched-secret`,
      );
      assert.equal(unmatchedResponse.status, 404);
      assert.match(
        unmatchedResponse.headers.get("x-request-id") ?? "",
        /^[0-9a-f-]{36}$/,
      );
      assert.equal(
        unmatchedResponse.headers.get("x-correlation-id"),
        unmatchedResponse.headers.get("x-request-id"),
      );

      await observability.logger.flush?.();

      const records = lines.map((line) => JSON.parse(line) as LogRecord);
      const completed = records.filter(
        (record) => record.event === "http.request.completed",
      );
      const successful = completed.filter((record) => record.status === 200);
      const failed = completed.find((record) => record.status === 500);
      assert.equal(successful.length, 2);
      assert.ok(failed);

      const requestIds = successful.map((record) => record.request_id);
      assert.equal(new Set(requestIds).size, 2);
      const operationLogs = records.filter(
        (record) => record.event === "test.auth.me.operation",
      );
      assert.equal(operationLogs.length, 3);
      assert.deepEqual(
        operationLogs.map((record) => record.request_id).sort(),
        [...requestIds, failedRequestId].sort(),
      );
      for (const record of operationLogs) {
        assert.equal(record.correlation_id, record.request_id);
        assert.match(record.trace_id ?? "", /^[0-9a-f]{32}$/);
        assert.match(record.span_id ?? "", /^[0-9a-f]{16}$/);
      }
      for (const record of successful) {
        assert.equal(record.correlation_id, record.request_id);
        assert.equal(record.method, "GET");
        assert.equal(record.route, "/v1/auth/me");
        assert.equal(typeof record.duration_ms, "number");
        assert.match(record.trace_id ?? "", /^[0-9a-f]{32}$/);
        assert.match(record.span_id ?? "", /^[0-9a-f]{16}$/);
      }
      assert.equal(failed.correlation_id, failed.request_id);
      assert.equal(failed.error_type, "Error");
      assert.equal(
        records.filter((record) => record.event === "error.exception.captured")
          .length,
        1,
      );
      assert.equal(
        records.find((record) => record.event === "error.exception.captured")
          ?.correlation_id,
        failed.correlation_id,
      );

      const serializedLogs = lines.join("");
      for (const untrustedValue of [
        "synthetic-bearer-a",
        "synthetic-bearer-b",
        "synthetic-failure",
        "synthetic-query-secret",
        "synthetic-unmatched-secret",
        "synthetic-unmatched",
        "caller-controlled-request-id",
        "caller-controlled-correlation-id",
        "synthetic private database failure",
      ]) {
        assert.equal(serializedLogs.includes(untrustedValue), false);
      }
    } finally {
      await app.close();
    }
  },
);

interface LogRecord {
  readonly event?: string;
  readonly request_id?: string;
  readonly correlation_id?: string;
  readonly trace_id?: string;
  readonly span_id?: string;
  readonly method?: string;
  readonly route?: string;
  readonly status?: number;
  readonly duration_ms?: number;
  readonly error_type?: string;
}
