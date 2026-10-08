const { withXcodeProject } = require("expo/config-plugins");

const safeInvocation = String.raw`RN_XCODE_SCRIPT=\"$(\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\")\"\n\"$RN_XCODE_SCRIPT\"`;

module.exports = function withSpaceSafeBundleScript(config) {
  return withXcodeProject(config, (config) => {
    const phases = Object.values(
      config.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {},
    ).filter(
      (phase) =>
        phase?.isa === "PBXShellScriptBuildPhase" &&
        typeof phase.shellScript === "string" &&
        phase.shellScript.includes("react-native-xcode.sh"),
    );

    if (phases.length !== 1) {
      throw new Error(
        `Expected one React Native Xcode bundle script, found ${phases.length}.`,
      );
    }

    const [phase] = phases;
    if (phase.shellScript.includes("RN_XCODE_SCRIPT=")) {
      return config;
    }

    const pathIndex = phase.shellScript.indexOf("react-native-xcode.sh");
    const invocationStart = phase.shellScript.lastIndexOf("`", pathIndex);
    const invocationEnd = phase.shellScript.indexOf("`", pathIndex);
    const lookupInvocation =
      invocationStart < 0 || invocationEnd <= invocationStart
        ? ""
        : phase.shellScript.slice(invocationStart, invocationEnd + 1);

    if (
      !lookupInvocation.includes("$NODE_BINARY") ||
      !lookupInvocation.includes("react-native/package.json")
    ) {
      throw new Error(
        "Could not recognize the generated React Native Xcode bundle script.",
      );
    }

    phase.shellScript =
      phase.shellScript.slice(0, invocationStart) +
      safeInvocation +
      phase.shellScript.slice(invocationEnd + 1);
    return config;
  });
};
