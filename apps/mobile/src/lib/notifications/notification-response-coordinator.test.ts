import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createNotificationResponseCoordinator,
  isNotificationNavigationReady,
  type NotificationResponseLike,
} from "./notification-response-coordinator.ts";
import {
  parseNotificationNavigationIntent,
  type NotificationNavigationIntent,
} from "./notification-navigation-intent.ts";

const foundationIntent = {
  v: 1,
  target: "foundation-validation",
} as const;

function createResponse(
  identifier: string,
  data: unknown,
): NotificationResponseLike {
  return {
    actionIdentifier: "default",
    notification: {
      request: {
        identifier,
        content: { data },
      },
    },
  };
}

function createCoordinator() {
  const destinations: NotificationNavigationIntent[] = [];
  let clearedResponses = 0;
  const coordinator = createNotificationResponseCoordinator({
    parseIntent: parseNotificationNavigationIntent,
    navigate: (intent) => {
      destinations.push(intent);
      return true;
    },
    clearLastNotificationResponse: () => {
      clearedResponses += 1;
    },
  });

  return {
    coordinator,
    destinations,
    get clearedResponses() {
      return clearedResponses;
    },
  };
}

test("notification navigation readiness requires completed Auth bootstrap and Router state", () => {
  assert.equal(
    isNotificationNavigationReady({
      authBootstrapComplete: false,
      routerReady: true,
    }),
    false,
  );
  assert.equal(
    isNotificationNavigationReady({
      authBootstrapComplete: true,
      routerReady: false,
    }),
    false,
  );
  assert.equal(
    isNotificationNavigationReady({
      authBootstrapComplete: true,
      routerReady: true,
    }),
    true,
  );
});

test("a live response navigates once", async () => {
  const state = createCoordinator();
  const response = createResponse("live-1", { navigation: foundationIntent });

  await state.coordinator.setNavigationReady(true);
  await state.coordinator.handleResponse(response, "live");

  assert.deepEqual(state.destinations, [foundationIntent]);
  assert.equal(state.clearedResponses, 1);
});

test("a cold-start response navigates and clears the consumed response", async () => {
  const state = createCoordinator();

  await state.coordinator.setNavigationReady(true);
  await state.coordinator.handleResponse(
    createResponse("cold-1", { navigation: foundationIntent }),
    "cold-start",
  );

  assert.deepEqual(state.destinations, [foundationIntent]);
  assert.equal(state.clearedResponses, 1);
});

test("the same response observed through live and cold-start paths navigates once", async () => {
  const state = createCoordinator();
  const response = createResponse("duplicate-1", {
    navigation: foundationIntent,
  });

  await state.coordinator.setNavigationReady(true);
  await state.coordinator.handleResponse(response, "live");
  await state.coordinator.handleResponse(response, "cold-start");
  await state.coordinator.handleResponse(response, "live");

  assert.deepEqual(state.destinations, [foundationIntent]);
  assert.equal(state.clearedResponses, 1);
});

test("a queued cold-start response waits for navigation readiness and then clears", async () => {
  const state = createCoordinator();
  const response = createResponse("queued-1", {
    navigation: foundationIntent,
  });

  await state.coordinator.setNavigationReady(false);
  await state.coordinator.handleResponse(response, "cold-start");

  assert.deepEqual(state.destinations, []);
  assert.equal(state.clearedResponses, 0);

  await state.coordinator.setNavigationReady(true);

  assert.deepEqual(state.destinations, [foundationIntent]);
  assert.equal(state.clearedResponses, 1);
});

test("a notification without a navigation intent is ignored", async () => {
  const state = createCoordinator();

  await state.coordinator.setNavigationReady(true);
  await state.coordinator.handleResponse(
    createResponse("unrelated-1", { message: "No navigation command" }),
    "live",
  );

  assert.deepEqual(state.destinations, []);
  assert.equal(state.clearedResponses, 0);
});

test("an unrelated cold-start response is ignored and consumed", async () => {
  const state = createCoordinator();

  await state.coordinator.setNavigationReady(false);
  await state.coordinator.handleResponse(
    createResponse("unrelated-cold-1", { message: "No navigation command" }),
    "cold-start",
  );

  assert.deepEqual(state.destinations, []);
  assert.equal(state.clearedResponses, 1);
});
