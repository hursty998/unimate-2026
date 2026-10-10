import assert from "node:assert/strict";
import process from "node:process";
import { expect, test } from "@playwright/test";
import { readSmokeCredentialsFile } from "../../scripts/local-smoke-fixture.mjs";

test.afterEach(async ({ page }) => {
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  if (await signOut.isVisible()) {
    await signOut.click();
    await expect(
      page.getByText("Auth: signed out", { exact: true }),
    ).toBeVisible();
  }
});

test("Foundation signs in, loads the authenticated identity, and signs out", async ({
  page,
}) => {
  const credentialsFile = process.env["UNIMATE_SMOKE_CREDENTIALS_FILE"];
  if (!credentialsFile) {
    throw new Error("The local synthetic smoke fixture is unavailable.");
  }
  const credentials = await readSmokeCredentialsFile(credentialsFile);

  await page.goto("/");
  await expect(
    page.getByText("Foundation ready", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("API: connected", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Auth: signed out", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(
    page.getByText("Auth: signed in", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("API identity: connected", { exact: true }),
  ).toBeVisible();

  const renderedIdentity = page.getByText(/^UniMate User ID: .+$/);
  await expect(renderedIdentity).toBeVisible();
  assert.match(
    (await renderedIdentity.textContent()) ?? "",
    /^UniMate User ID: [0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("Auth: signed out", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue("");
  await expect(page.getByLabel("Password")).toHaveValue("");
});
