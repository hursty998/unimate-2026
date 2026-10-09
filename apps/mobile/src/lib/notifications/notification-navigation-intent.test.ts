import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dispatchNotificationNavigationIntent,
  foundationNotificationNavigationIntent,
  parseNotificationNavigationIntent,
} from "./notification-navigation-intent.ts";

test("parses and dispatches the v1 foundation navigation intent", () => {
  const intent = parseNotificationNavigationIntent({
    v: 1,
    target: "foundation-validation",
  });
  const destinations: string[] = [];

  assert.deepEqual(intent, foundationNotificationNavigationIntent);
  assert.ok(intent);
  assert.equal(
    dispatchNotificationNavigationIntent(intent, (href) =>
      destinations.push(href),
    ),
    true,
  );
  assert.deepEqual(destinations, ["/validation"]);
});

test("rejects malformed intents and unknown versions or targets", () => {
  assert.equal(parseNotificationNavigationIntent(null), null);
  assert.equal(parseNotificationNavigationIntent([]), null);
  assert.equal(parseNotificationNavigationIntent({ v: 1 }), null);
  assert.equal(
    parseNotificationNavigationIntent({
      v: 2,
      target: "foundation-validation",
    }),
    null,
  );
  assert.equal(
    parseNotificationNavigationIntent({ v: 1, target: "events" }),
    null,
  );
});

test("rejects arbitrary URLs, paths, and extra navigation fields", () => {
  assert.equal(parseNotificationNavigationIntent("/validation"), null);
  assert.equal(
    parseNotificationNavigationIntent({ v: 1, target: "/validation" }),
    null,
  );
  assert.equal(
    parseNotificationNavigationIntent({
      v: 1,
      target: "foundation-validation",
      url: "https://example.invalid/path",
    }),
    null,
  );
  assert.equal(
    parseNotificationNavigationIntent({ v: 1, url: "/validation" }),
    null,
  );
});
