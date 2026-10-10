import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import process from "node:process";
import playwrightConfig from "../playwright.config.mjs";
import {
  createLocalSmokeFixture,
  cleanupLocalSmokeFixture,
  deleteUniMateIdentityIfPresent,
  readSmokeCredentialsFile,
  validateLocalSmokeTarget,
} from "./local-smoke-fixture.mjs";

const localStatus = {
  API_URL: "http://127.0.0.1:55321",
  DB_URL: "postgresql://127.0.0.1:55322/postgres",
  PUBLISHABLE_KEY: "sb_publishable_local-test",
  SECRET_KEY: "sb_secret_local-test",
};
const localDatabaseUrl = "postgresql://127.0.0.1:55322/postgres?schema=app";
const localDirectUrl = "postgresql://127.0.0.1:55322/postgres?schema=app";

function localTarget() {
  return validateLocalSmokeTarget({
    supabaseStatus: localStatus,
    databaseUrl: localDatabaseUrl,
    directUrl: localDirectUrl,
  });
}

function jsonResponse(body, status = 200) {
  return new globalThis.Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("fixture guard refuses hosted Supabase and PostgreSQL endpoints", () => {
  assert.throws(
    () =>
      validateLocalSmokeTarget({
        supabaseStatus: {
          ...localStatus,
          API_URL: "https://hosted-project.supabase.co",
        },
        databaseUrl: localDatabaseUrl,
        directUrl: localDirectUrl,
      }),
    /local loopback Supabase API/,
  );

  assert.throws(
    () =>
      validateLocalSmokeTarget({
        supabaseStatus: localStatus,
        databaseUrl: "postgresql://db.example.test:5432/postgres?schema=app",
        directUrl: "postgresql://db.example.test:5432/postgres?schema=app",
      }),
    /loopback PostgreSQL/,
  );
});

test("fixture creation and cleanup never print credentials or Supabase keys", async () => {
  const target = localTarget();
  const userId = "11111111-1111-4111-8111-111111111111";
  const requests = [];
  let fixtureEmail;
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = function (chunk) {
    output += String(chunk);
    return true;
  };

  try {
    const fixture = await createLocalSmokeFixture({
      target,
      cleanupDatabaseIdentity: async () => {},
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        if (options.method === "POST") {
          fixtureEmail = JSON.parse(options.body).email;
          return jsonResponse({ id: userId });
        }
        if (options.method === "GET") {
          return jsonResponse({ id: userId, email: fixtureEmail });
        }
        return jsonResponse({});
      },
    });
    const password = fixture.password;
    await fixture.cleanup();

    assert.match(fixture.email, /^unimate-smoke-.*@example\.test$/);
    assert.ok(password.length >= 32);
    assert.equal(
      requests[0].options.body,
      JSON.stringify({
        email: fixture.email,
        password,
        email_confirm: true,
      }),
    );
    assert.ok(
      requests.every(
        ({ options }) => options.headers.apikey === target.secretKey,
      ),
    );
    assert.ok(
      requests.every(({ options }) =>
        options.headers.Authorization.includes(target.secretKey),
      ),
    );
    assert.equal(output.includes(password), false);
    assert.equal(output.includes(target.secretKey), false);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test("fixture cleanup tolerates an Auth user with no UniMate identity", async () => {
  const userId = "22222222-2222-4222-8222-222222222222";
  let fixtureEmail;
  let authDeleted = false;
  const fixture = await createLocalSmokeFixture({
    target: localTarget(),
    cleanupDatabaseIdentity: (providerSubject) =>
      deleteUniMateIdentityIfPresent(
        {
          client: {
            authIdentity: {
              async findMany() {
                assert.equal(providerSubject, userId);
                return [];
              },
            },
            user: {
              async deleteMany() {
                assert.fail(
                  "No app user should be deleted when no identity exists.",
                );
              },
            },
          },
        },
        providerSubject,
      ),
    fetchImpl: async (_url, options) => {
      if (options.method === "POST") {
        fixtureEmail = JSON.parse(options.body).email;
        return jsonResponse({ id: userId });
      }
      if (options.method === "GET") {
        return jsonResponse({ id: userId, email: fixtureEmail });
      }
      if (options.method === "DELETE") {
        authDeleted = true;
      }
      return jsonResponse({});
    },
  });

  await fixture.cleanup();
  assert.equal(authDeleted, true);
});

test("fixture setup failure recovers and deletes a partially created Auth user", async () => {
  const userId = "44444444-4444-4444-8444-444444444444";
  const deletedUsers = [];
  const fetchImpl = async (url, options) => {
    if (options.method === "POST") {
      return jsonResponse({ message: "simulated interrupted response" }, 500);
    }
    if (options.method === "GET") {
      return jsonResponse({
        users: [{ id: userId, email: url.searchParams.get("filter") }],
      });
    }
    if (options.method === "DELETE") {
      deletedUsers.push(url.pathname);
      return jsonResponse({});
    }
    assert.fail(`Unexpected local Auth fixture method: ${options.method}`);
  };

  await assert.rejects(
    createLocalSmokeFixture({
      target: localTarget(),
      cleanupDatabaseIdentity: async (providerSubject) => {
        assert.equal(providerSubject, userId);
      },
      fetchImpl,
    }),
    /fixture creation failed/,
  );
  assert.deepEqual(deletedUsers, [`/auth/v1/admin/users/${userId}`]);
});

test("fixture cleanup refuses to delete an Auth user that does not match its email", async () => {
  const userId = "55555555-5555-4555-8555-555555555555";
  let appIdentityDeleted = false;
  let authUserDeleted = false;
  const fixture = await createLocalSmokeFixture({
    target: localTarget(),
    cleanupDatabaseIdentity: async () => {
      appIdentityDeleted = true;
    },
    fetchImpl: async (_url, options) => {
      if (options.method === "POST") {
        return jsonResponse({ id: userId });
      }
      if (options.method === "GET") {
        return jsonResponse({
          id: userId,
          email: "real-person@example.test",
        });
      }
      if (options.method === "DELETE") {
        authUserDeleted = true;
      }
      return jsonResponse({});
    },
  });

  await assert.rejects(
    fixture.cleanup(),
    (error) =>
      error instanceof AggregateError &&
      error.errors.some((cause) => cause.message.includes("does not match")),
  );
  assert.equal(appIdentityDeleted, false);
  assert.equal(authUserDeleted, false);
});

test("fixture retains private recovery credentials when automatic cleanup fails", async () => {
  const userId = "66666666-6666-4666-8666-666666666666";
  let setupError;
  try {
    await createLocalSmokeFixture({
      target: localTarget(),
      cleanupDatabaseIdentity: async () => {},
      fetchImpl: async (_url, options) =>
        options.method === "POST"
          ? jsonResponse({ message: "simulated interrupted response" }, 500)
          : jsonResponse({ message: "temporary local Auth outage" }, 503),
    });
  } catch (error) {
    setupError = error;
  }

  assert.ok(setupError instanceof AggregateError);
  const recoveryPath = /pnpm smoke:fixture:cleanup -- ([^`]+)`/.exec(
    setupError.message,
  )?.[1];
  assert.ok(recoveryPath);
  const credentials = await readSmokeCredentialsFile(recoveryPath);
  assert.equal(credentials.userId, undefined);
  assert.ok(credentials.password.length >= 32);

  let authDeleted = false;
  await cleanupLocalSmokeFixture({
    target: localTarget(),
    ...credentials,
    credentialsFile: recoveryPath,
    cleanupDatabaseIdentity: async (providerSubject) => {
      assert.equal(providerSubject, userId);
    },
    fetchImpl: async (_url, options) => {
      if (options.method === "GET") {
        return jsonResponse({
          users: [{ id: userId, email: credentials.email }],
        });
      }
      if (options.method === "DELETE") {
        authDeleted = true;
      }
      return jsonResponse({});
    },
  });
  assert.equal(authDeleted, true);
  await assert.rejects(stat(recoveryPath), { code: "ENOENT" });
});

test("native fixture credentials use a private temporary file with no server key", async () => {
  const userId = "33333333-3333-4333-8333-333333333333";
  let credentialsFile;
  let fixtureEmail;
  const fixture = await createLocalSmokeFixture({
    target: localTarget(),
    cleanupDatabaseIdentity: async () => {},
    fetchImpl: async (_url, options) => {
      if (options.method === "POST") {
        fixtureEmail = JSON.parse(options.body).email;
        return jsonResponse({ id: userId });
      }
      if (options.method === "GET") {
        return jsonResponse({ id: userId, email: fixtureEmail });
      }
      return jsonResponse({});
    },
  });

  try {
    credentialsFile = await fixture.writeCredentialsFile();
    const info = await stat(credentialsFile);
    const contents = await readFile(credentialsFile, "utf8");
    const credentials = await readSmokeCredentialsFile(credentialsFile);
    assert.equal(info.mode & 0o777, 0o600);
    assert.equal(contents.includes("secretKey"), false);
    assert.deepEqual(Object.keys(credentials).sort(), [
      "email",
      "password",
      "userId",
    ]);
  } finally {
    await fixture.cleanup();
    if (credentialsFile) {
      await assert.rejects(stat(credentialsFile), { code: "ENOENT" });
    }
  }
});

test("Playwright keeps isolated state and retains only useful failure artifacts", () => {
  assert.deepEqual(playwrightConfig.use.storageState, {
    cookies: [],
    origins: [],
  });
  assert.equal(playwrightConfig.use.screenshot, "only-on-failure");
  assert.equal(playwrightConfig.use.trace, "retain-on-failure");
  assert.equal(playwrightConfig.retries, 0);
  assert.equal(playwrightConfig.workers, 1);
  assert.equal(playwrightConfig.webServer.reuseExistingServer, false);
});
