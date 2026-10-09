import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpoPushProvider } from "./expo.js";
import {
  parsePushSubmissionHandle,
  PushProviderError,
  type PushDataValue,
  type PushMessage,
} from "./index.js";

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

  assert.deepEqual(await provider.send(message), {
    handle: "expo-ticket-not-exposed",
  });
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

test("rejects successful Expo tickets without a non-empty receipt handle", async () => {
  for (const id of [undefined, "", " \t ", " padded-id "]) {
    const provider = new ExpoPushProvider({
      fetcher: async () => response({ data: { status: "ok", id } }),
    });

    await assert.rejects(
      provider.send(message),
      (error: unknown) =>
        error instanceof PushProviderError && error.kind === "transient",
    );
  }
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

test("checks Expo receipts using the documented endpoint and maps acceptance", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const provider = new ExpoPushProvider({
    fetcher: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return response({
        data: { "expo-receipt-not-exposed": { status: "ok" } },
      });
    },
  });

  assert.deepEqual(
    await provider.checkReceipt(
      parsePushSubmissionHandle("expo-receipt-not-exposed"),
    ),
    { status: "accepted" },
  );
  assert.equal(requestUrl, "https://exp.host/--/api/v2/push/getReceipts");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    ids: ["expo-receipt-not-exposed"],
  });
});

test("treats a missing Expo receipt as pending rather than accepted", async () => {
  const provider = new ExpoPushProvider({
    fetcher: async () => response({ data: {} }),
  });

  assert.deepEqual(
    await provider.checkReceipt(parsePushSubmissionHandle("not-yet-available")),
    { status: "pending" },
  );
});

test("maps Expo receipt invalid-token, transient, and permanent errors safely", async () => {
  const providerFor = (error: string) =>
    new ExpoPushProvider({
      fetcher: async () =>
        response({
          data: {
            "receipt-handle": {
              status: "error",
              message: "provider response is never surfaced",
              details: { error },
            },
          },
        }),
    });

  await assert.rejects(
    providerFor("DeviceNotRegistered").checkReceipt(
      parsePushSubmissionHandle("receipt-handle"),
    ),
    (error: unknown) =>
      error instanceof PushProviderError &&
      error.kind === "invalid-token" &&
      !error.message.includes(message.destinationToken),
  );
  await assert.rejects(
    providerFor("MessageRateExceeded").checkReceipt(
      parsePushSubmissionHandle("receipt-handle"),
    ),
    (error: unknown) =>
      error instanceof PushProviderError && error.kind === "transient",
  );
  await assert.rejects(
    providerFor("MessageTooBig").checkReceipt(
      parsePushSubmissionHandle("receipt-handle"),
    ),
    (error: unknown) =>
      error instanceof PushProviderError &&
      error.kind === "rejected" &&
      !error.message.includes("provider response"),
  );
});

test("fails closed for malformed receipt responses and maps service failures", async () => {
  for (const body of [
    undefined,
    null,
    { data: [] },
    { data: { "receipt-handle": null } },
    { data: { "receipt-handle": { status: "unknown" } } },
  ]) {
    const provider = new ExpoPushProvider({
      fetcher: async () =>
        body === undefined
          ? new Response("not json", { status: 200 })
          : response(body),
    });

    await assert.rejects(
      provider.checkReceipt(parsePushSubmissionHandle("receipt-handle")),
      (error: unknown) =>
        error instanceof PushProviderError && error.kind === "transient",
    );
  }

  const unavailable = new ExpoPushProvider({
    fetcher: async () => new Response("private provider body", { status: 503 }),
  });

  await assert.rejects(
    unavailable.checkReceipt(parsePushSubmissionHandle("receipt-handle")),
    (error: unknown) =>
      error instanceof PushProviderError &&
      error.kind === "transient" &&
      error.status === 503 &&
      !error.message.includes("private provider body"),
  );
});

test("rejects cyclic, sparse, non-finite, and non-plain push data before sending", async () => {
  let requestCount = 0;
  const provider = new ExpoPushProvider({
    fetcher: async () => {
      requestCount += 1;
      return response({ data: { status: "ok", id: "synthetic-handle" } });
    },
  });
  const cyclicData: Record<string, PushDataValue> = {};
  cyclicData["self"] = cyclicData;
  const sparseArray: PushDataValue[] = [];
  sparseArray.length = 1;

  for (const data of [
    cyclicData,
    { value: new Date() },
    { value: sparseArray },
    { value: Number.NaN },
  ]) {
    await assert.rejects(
      provider.send({ ...message, data } as PushMessage),
      TypeError,
    );
  }

  assert.equal(requestCount, 0);
});
