import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const mobileDirectory = resolve(repositoryRoot, "apps/mobile");
const expoCli = resolve(mobileDirectory, "node_modules/expo/bin/cli");
const apiUrl = process.env["UNIMATE_SMOKE_API_URL"] ?? "http://127.0.0.1:3000";
const supabaseUrl =
  process.env["UNIMATE_SMOKE_SUPABASE_URL"] ?? "http://127.0.0.1:55321";
const supabasePublishableKey =
  process.env["UNIMATE_SMOKE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
const webUrl = process.env["UNIMATE_SMOKE_WEB_URL"] ?? "http://localhost:8082";

export default defineConfig({
  testDir: "./tests/smoke",
  testMatch: "*.spec.mjs",
  outputDir:
    process.env["UNIMATE_PLAYWRIGHT_OUTPUT_DIR"] ??
    resolve(repositoryRoot, "test-results/phase-13-web-smoke"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: "line",
  use: {
    baseURL: webUrl,
    browserName: "chromium",
    headless: true,
    storageState: { cookies: [], origins: [] },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `"${process.execPath}" "${expoCli}" start --web --localhost --port 8082`,
    cwd: mobileDirectory,
    url: `${webUrl}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      EXPO_PUBLIC_API_URL: apiUrl,
      EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
    },
  },
});
