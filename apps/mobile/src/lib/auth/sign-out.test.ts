import assert from "node:assert/strict";
import { test } from "node:test";
import { signOutCurrentSession } from "./sign-out.ts";

test("ordinary sign out only targets the current Supabase session", async () => {
  const scopes: string[] = [];

  await signOutCurrentSession(async ({ scope }) => {
    scopes.push(scope);
    return { error: null };
  });

  assert.deepEqual(scopes, ["local"]);
});
