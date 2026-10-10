# Phase 13 - Browser and native smoke

## Baseline

- Started from clean `development` HEAD `588bd52` (Phase 12 present).
- Local Supabase is running at loopback; committed migrations and Prisma schema
  are current (`pnpm db:check`, `supabase migration list --local`).
- No schema or Supabase migration is expected.

## Work and evidence

- [x] Add guarded local synthetic Auth fixture with guaranteed cleanup and
      non-secret failure tests. Eight focused fixture/config tests pass,
      covering hosted endpoint refusal, secret/password output, missing app
      identity, partial Auth-user recovery, Auth-ID/email mismatch protection,
      retained mode-0600 recovery credentials after automatic cleanup failure,
      and browser storage/artifact policy.
- [x] Add exact-pinned Playwright runner, real-stack Foundation smoke, and
      self-contained `pnpm smoke:web`. `@playwright/test` 1.63.0; Chromium
      153.0.8010.12. The durable flow passed against local Supabase Auth,
      NestJS, and PostgreSQL, with a fresh browser context and cleanup.
      `pnpm smoke:web` now starts and owns its API on `127.0.0.1:3013` using
      the validated local database and Supabase endpoints, then starts its own
      web server. It fails on an occupied port, does not reuse or stop another
      process, checks the API listener PID against its spawned child, cleans the
      fixture, and stops that child. Focused process tests cover refusal to
      reuse a same-checkout API and fail-closed behavior when owner lookup is
      empty. The final real-stack run passed in 18.7 seconds. Playwright MCP is
      not required or part of the supported smoke flow.
- [x] Targeted local-only API hardening: `smoke:web` verifies local Supabase and
      PostgreSQL, refuses occupied dedicated port 3013 even if the listener
      belongs to this checkout, starts its own API with explicit validated
      local `DATABASE_URL`, `DIRECT_URL`, Supabase URL/secret, and loopback
      binding, verifies the listening PID is the spawned child, then stops only
      that child. It never introspects or reuses another process environment.
      Four focused tests cover occupied same-checkout refusal, available port,
      fail-closed empty owner results, and exact listener ownership.
- [x] Corrected completion semantics while retaining incident history:
      interactive-browser tool use once for a page open was not a smoke journey
      and does not make Playwright MCP part of the supported workflow. One
      generated local `example.test` password appeared in a browser snapshot;
      that user and app identity were deleted. No real/reusable credential or
      server secret was exposed or committed. Acceptance is no real/reusable
      credentials or server secrets exposed/committed; synthetic local
      credentials remain ephemeral, private, and cleaned.
- [x] Persisted Xcode 27 DeviceHub discovery in `apps/mobile/AGENTS.md`:
      surface DeviceHub and reuse the already-booted simulator.
- [x] Verify browser interaction using VS Code integrated browser. Foundation,
      API connectivity, sign-in, authenticated identity, visible UniMate ID,
      and sign-out passed. A historical `playwright-browser_navigate` call was
      used once for page opening during exploratory setup (not a smoke journey);
      its local output was removed. This tool is not required by the supported
      workflow and the historical invocation is not a completion blocker. An
      interactive snapshot once showed the random password of the synthetic
      local `example.test` account. The account and corresponding UniMate
      identity were deleted; no real/reusable credential or server secret was
      exposed or committed. The incident is retained here; the final security
      criterion is no real/reusable credentials or server secrets exposed or
      committed, while synthetic credentials remain ephemeral and cleaned.
      Avoid displaying synthetic passwords interactively where practical.
      Signed-in screenshot evidence is in the session output.
- [x] Verify the final browser flow after sign-out clears both form fields.
      The Playwright assertion and the successful local smoke observed empty
      email and password fields. Final durable browser smoke passed after
      cleanup hardening in 13.4 seconds.
- [x] Exercise existing native clients with agent-device. iPhone 17 on iOS
      27.0 (runtime 24A434) reused `com.unimate.ios`; Android
      Pixel_3a_API_34_extension_level_7_arm64-v8a (Android 14 / API 34)
      reused `com.unimate.app`. Neither was rebuilt. Both first-run flows passed
      Foundation launch, API connectivity, signed-out state, synthetic sign-in,
      authenticated `getMe`, visible ID, and sign-out with no fatal app logs.
      Screenshots: `/var/folders/5l/_77kxkgd3n5cslq17txkn46m0000gn/T/agent-device-screenshot-lSd02S/screenshot.png`
      (iOS) and
      `/var/folders/5l/_77kxkgd3n5cslq17txkn46m0000gn/T/agent-device-screenshot-SGXoJj/screenshot.png`
      (Android).
- [x] Rerun Android after clearing the email/password fields on sign-out.
      After one Android System UI ANR, an authorized AVD reboot completed and
      agent-device reconnected. The final Android flow passed API, sign-in,
      `getMe`, identity, sign-out, and cleared fields, with no fatal logs.
      Final screenshot:
      `/var/folders/5l/_77kxkgd3n5cslq17txkn46m0000gn/T/agent-device-screenshot-gVqLnn/screenshot.png`.
- [x] Rerun iOS after clearing sign-out fields and verify visibly. DeviceHub
      (the Xcode 27 simulator GUI) was foregrounded; iPhone 17 on iOS 27.0
      launched the reused client, API connected, the synthetic account signed
      in, `getMe` rendered the identity, and sign-out cleared both fields. No
      fatal runtime logs. Screenshot:
      `/var/folders/5l/_77kxkgd3n5cslq17txkn46m0000gn/T/agent-device-screenshot-6PxUA5/screenshot.png`.
- [x] Add `SMOKE_TESTING.md`, point to it from `VERIFICATION.md`, and document
      the Xcode 27 DeviceHub guidance in `apps/mobile/AGENTS.md`.
- [x] Deep review and retrospective are complete. The preceding Phase 13
      implementation passed `pnpm verify:changed`, `pnpm verify`,
      `pnpm secrets:check`, `git diff --check`, and `pnpm git-diff`. This
      targeted hardening has its own final verification sequence below. No CI,
      EAS, migration, SDK, physical-phone, or product analytics work was
      started.

## Retrospective

Largest recurring friction was local port ownership: Tailscale owns 8081 and
Expo’s localhost binding needed an IPv4 Metro port for the Android emulator.
Browser API reuse had a real safety gap because checkout cwd did not prove its
database/auth targets; the smoke now owns port 3013 and binds validated local
targets. Xcode 27 uses DeviceHub in place of `Simulator.app`; that durable
instruction is now in [apps/mobile/AGENTS.md](../../../apps/mobile/AGENTS.md).
Two historical process deviations remain recorded above: one page-open via a
Playwright browser tool (the MCP is not supported or required) and one snapshot
showing only a synthetic local password. Neither is an unresolved acceptance
blocker: no real/reusable credentials or server secrets were exposed or
committed, fixture records were deleted, and synthetic credentials are
ephemeral/private/cleaned by the harness. No hook or extra framework is
warranted.

## Verification retries

- The first final `pnpm verify` stopped at secret scanning because test-only
  PostgreSQL URL strings embedded placeholder usernames/passwords. The tests
  now use credential-free local URLs; all eight focused tests pass and
  `pnpm secrets:check` passes. The subsequent single successful full verify
  passed.

Final targeted-hardening checks: the focused smoke suite passed (12 tests), the
single updated `pnpm smoke:web` passed in 13.8 seconds using its owned API on
port 3013, and `pnpm verify:changed` passed. The single final `pnpm verify`
passed in 22.3 seconds. `pnpm secrets:check` passed, `git diff --check` passed,
and `pnpm git-diff` completed. Historical deviations remain preserved above
and are not blockers under the corrected semantics.
