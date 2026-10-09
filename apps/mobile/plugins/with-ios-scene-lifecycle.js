const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const sceneManifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "EXExpoAppSceneDelegate",
      },
    ],
  },
};

const legacyWindowStartup =
  /\n\n#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s+factory\.startReactNative\(\s+withModuleName: "main",\s+in: window,\s+launchOptions: launchOptions\)\s+#endif\n\n/;

function configureSceneManifest(infoPlist) {
  const existingManifest = infoPlist.UIApplicationSceneManifest;

  if (
    existingManifest &&
    JSON.stringify(existingManifest) !== JSON.stringify(sceneManifest)
  ) {
    throw new Error(
      "The iOS scene manifest conflicts with Expo's scene delegate configuration.",
    );
  }

  infoPlist.UIApplicationSceneManifest = sceneManifest;
  return infoPlist;
}

function convertAppDelegate(contents) {
  const hasLegacyAppDelegate = contents.includes(
    "class AppDelegate: ExpoAppDelegate {",
  );
  const hasSceneBasedAppDelegate = contents.includes(
    "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
  );

  if (!hasLegacyAppDelegate && !hasSceneBasedAppDelegate) {
    throw new Error(
      "The generated iOS AppDelegate template is not compatible with Expo's scene lifecycle plugin.",
    );
  }

  if (hasLegacyAppDelegate && legacyWindowStartup.test(contents)) {
    return contents
      .replace(
        "class AppDelegate: ExpoAppDelegate {",
        "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
      )
      .replace(legacyWindowStartup, "\n\n");
  }

  if (
    !hasSceneBasedAppDelegate ||
    contents.includes("factory.startReactNative(")
  ) {
    throw new Error(
      "The generated iOS AppDelegate could not be safely converted to scene-based startup.",
    );
  }

  return contents;
}

module.exports = function withIOSSceneLifecycle(config) {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults = configureSceneManifest(modConfig.modResults);
    return modConfig;
  });

  return withAppDelegate(config, (modConfig) => {
    modConfig.modResults.contents = convertAppDelegate(
      modConfig.modResults.contents,
    );
    return modConfig;
  });
};

module.exports.configureSceneManifest = configureSceneManifest;
module.exports.convertAppDelegate = convertAppDelegate;
