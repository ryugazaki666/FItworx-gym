const { withAndroidManifest, withAppBuildGradle } = require("expo/config-plugins");

const CMAKE_OBJECT_PATH_LIMIT = "-DCMAKE_OBJECT_PATH_MAX=200";

module.exports = function withAndroidBuildConfig(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Could not find the Android application manifest entry.");
    }

    application.$ = application.$ || {};
    application.$["android:usesCleartextTraffic"] = "true";
    return modConfig;
  });

  if (process.platform !== "win32") return config;

  return withAppBuildGradle(config, (modConfig) => {
    const contents = modConfig.modResults.contents;
    if (contents.includes(CMAKE_OBJECT_PATH_LIMIT)) return modConfig;

    const defaultConfig = /defaultConfig\s*\{/;
    if (!defaultConfig.test(contents)) {
      throw new Error("Could not find defaultConfig in android/app/build.gradle.");
    }

    modConfig.modResults.contents = contents.replace(
      defaultConfig,
      `$&\n        externalNativeBuild {\n            cmake {\n                arguments "${CMAKE_OBJECT_PATH_LIMIT}"\n            }\n        }\n`,
    );
    return modConfig;
  });
};
