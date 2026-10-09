import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationForegroundPresentationBehavior } from "./notification-presentation-policy.ts";

test("foreground notifications show in banner and list without sound or badge", () => {
  assert.deepEqual(notificationForegroundPresentationBehavior, {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
});
