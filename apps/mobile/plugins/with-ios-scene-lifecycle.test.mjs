import assert from "node:assert/strict";
import { test } from "node:test";
import sceneLifecyclePlugin from "./with-ios-scene-lifecycle.js";

const { configureSceneManifest, convertAppDelegate } = sceneLifecyclePlugin;

const legacyAppDelegate = `class AppDelegate: ExpoAppDelegate {

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

}`;

test("configures Expo's scene delegate in the iOS scene manifest", () => {
  const infoPlist = {};

  configureSceneManifest(infoPlist);
  configureSceneManifest(infoPlist);

  assert.equal(
    infoPlist.UIApplicationSceneManifest.UISceneConfigurations
      .UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName,
    "EXExpoAppSceneDelegate",
  );
});

test("converts legacy AppDelegate startup and is safe to apply repeatedly", () => {
  const converted = convertAppDelegate(legacyAppDelegate);

  assert.match(
    converted,
    /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider \{/,
  );
  assert.doesNotMatch(converted, /factory\.startReactNative\(/);
  assert.equal(convertAppDelegate(converted), converted);
});

test("fails closed for an incompatible generated AppDelegate template", () => {
  assert.throws(
    () => convertAppDelegate("class AppDelegate: NewExpoAppDelegate {}"),
    /not compatible with Expo's scene lifecycle plugin/,
  );
});
