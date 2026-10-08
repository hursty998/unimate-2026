# UniMate Mobile

Expo Router application for iOS, Android, and web. The app uses Expo Continuous
Native Generation: `ios/` and `android/` are generated from `app.json` and
installed native modules and must not be committed or maintained manually.

From the repository root:

```sh
pnpm --filter @unimate/mobile dev
pnpm --filter @unimate/mobile web
pnpm --filter @unimate/mobile ios
pnpm --filter @unimate/mobile android
```

Native changes require regenerating/rebuilding the development client. See
[`docs/engineering/NATIVE_RUNTIME.md`](../../docs/engineering/NATIVE_RUNTIME.md)
for the dependency inventory and rebuild policy.
