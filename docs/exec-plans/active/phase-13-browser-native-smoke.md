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
      Playwright MCP was not needed for the durable smoke. A first web-server
      timeout was caused by Expo binding IPv6 localhost while the readiness
      probe used IPv4; localhost and dual-stack port ownership checks resolved
      it. A final browser run after form clearing and fixture cleanup identity
      checks passed in 13.4 seconds.
- [x] Verify browser interaction using VS Code integrated browser. Foundation,
      API connectivity, sign-in, authenticated identity, visible UniMate ID,
      and sign-out passed. The exploratory run predates the field-clearing edit;
      final empty-field state is covered by the durable browser test. A separate
      `playwright-browser_navigate` tool was inadvertently invoked for a page
      open (no smoke journey); its local `.playwright-mcp/` output was removed.
      Therefore the "Playwright MCP was not used" acceptance criterion is
      **not met**. The interactive browser returned a synthetic password in a
      field snapshot once; it was not a human credential, the local fixture was
      removed, and no server key was exposed. The signed-in screenshot is
      visible in session output; no persistent artifact was requested.
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
- [x] Add `SMOKE_TESTING.md` and point to it from `VERIFICATION.md`. No AGENTS
      change was necessary.
- [x] Deep review and retrospective are complete. `pnpm verify:changed` passed,
      the final `pnpm verify` passed in 23.3 seconds, standalone
      `pnpm secrets:check` and `git diff --check` pass, and `pnpm git-diff`
      generated its ignored review artifact. The plan remains active solely
      because the Playwright MCP prohibition was violated once as described
      above. No CI, EAS, migration, SDK, physical-phone, or product analytics
      work was started.

## Retrospective

The largest recurring runtime friction was local endpoint/port ownership:
Tailscale holds 8081 and this Expo localhost listener bound IPv6 while the
emulator needs IPv4. The smoke-specific docs now preserve port owners and call
for a separate IPv4 Metro port. Android System UI had one ANR after relaunch;
one local AVD reboot recovered it, and the post-reboot smoke passed. Xcode 27
uses DeviceHub in place of `Simulator.app`; the owner clarification resolved
the apparent GUI blocker. One accidental `playwright-browser_navigate` was used
for a page open, contrary to the explicit precedence. Its generated local
artifacts were removed; the rest of interactive inspection used the VS Code
integrated browser. This is a process lapse, not something a repository hook
can reliably prevent. An interactive browser snapshot also exposed the
synthetic password once; the smoke docs now require checking that the selected
browser tool masks password fields before login. Tool precedence and this
credential-display guard are in the canonical smoke docs; no hook or extra
framework is warranted.

## Verification retries

- The first final `pnpm verify` stopped at secret scanning because test-only
  PostgreSQL URL strings embedded placeholder usernames/passwords. The tests
  now use credential-free local URLs; all eight focused tests pass and
  `pnpm secrets:check` passes. The subsequent single successful full verify
  passed.

Keep this plan active until every Phase 13 acceptance criterion passes. Record
runtime, cleanup, artifact, and verification evidence here before moving it to
`completed/`.
