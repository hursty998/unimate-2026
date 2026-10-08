import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpoPushProvider } from "./expo.js";
import { PushProviderError, type PushMessage } from "./index.js";

const message: PushMessage = {
  destinationToken: "ExponentPushToken[synthetic]",
  title: "Foundation test",
  body: "No live device is contacted by this unit test.",
  data: { fixture: "synthetic", count: 1 },
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("sends one provider-neutral message to the documented Expo endpoint", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const provider = new ExpoPushProvider({
    fetcher: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return response({
        data: { status: "ok", id: "expo-ticket-not-exposed" },
      });
    },
  });

  assert.equal(await provider.send(message), undefined);
  assert.equal(requestUrl, "https://exp.host/--/api/v2/push/send");
  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(requestInit?.headers, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    to: message.destinationToken,
    title: message.title,
    body: message.body,
    data: message.data,
  });
});

test("maps Expo's invalid-device ticket without exposing its response", async () => {
  const provider = new ExpoPushProvider({
    fetcher: async () =>
      response({
        data: [
          {
            status: "error",
            message: "contains a provider token and is deliberately omitted",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      }),
  });

  await assert.rejects(
    provider.send(message),
    (error: unknown) =>
      error instanceof PushProviderError &&
      error.kind === "invalid-token" &&
      !error.message.includes(message.destinationToken),
  );
});

test("maps rate limits and provider HTTP errors to UniMate-owned failures", async () => {
  const rateLimited = new ExpoPushProvider({
    fetcher: async () =>
      response({
        data: [
          {
            status: "error",
            details: { error: "MessageRateExceeded" },
          },
        ],
      }),
  });
  const unavailable = new ExpoPushProvider({
    fetcher: async () => new Response("provider internals", { status: 503 }),
  });

  await assert.rejects(
    rateLimited.send(message),
    (error: unknown) =>
      error instanceof PushProviderError && error.kind === "transient",
  );
  await assert.rejects(
    unavailable.send(message),
    (error: unknown) =>
      error instanceof PushProviderError &&
      error.kind === "transient" &&
      error.status === 503 &&
      !error.message.includes("provider internals"),
  );
});

test("maps other Expo ticket errors to permanent provider rejection", async () => {
  const provider = new ExpoPushProvider({
    fetcher: async () =>
      response({
        data: [{ status: "error", details: { error: "MessageTooBig" } }],
      }),
  });

  await assert.rejects(
    provider.send(message),
    (error: unknown) =>
      error instanceof PushProviderError && error.kind === "rejected",
  );
});
