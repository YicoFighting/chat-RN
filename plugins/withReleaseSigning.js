const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Expo Config Plugin: Inject release signing configuration into android/app/build.gradle.
 * Reads credentials from android/keystore.properties.
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    let contents = gradleConfig.modResults.contents;

    // Skip if already configured (idempotent)
    if (contents.includes("keystorePropertiesFile")) {
      return gradleConfig;
    }

    // 1. Insert keystoreProperties loading before "android {" block
    contents = contents.replace(
      "\nandroid {",
      [
        "",
        "def keystorePropertiesFile = rootProject.file('../keystore.properties')",
        "def keystoreProperties = new Properties()",
        "if (keystorePropertiesFile.exists()) {",
        "    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))",
        "}",
        "",
        "android {",
      ].join("\n"),
    );

    // 2. Add release signing config after the debug signing block
    contents = contents.replace(
      [
        "    signingConfigs {",
        "        debug {",
        "            storeFile file('debug.keystore')",
        "            storePassword 'android'",
        "            keyAlias 'androiddebugkey'",
        "            keyPassword 'android'",
        "        }",
        "    }",
      ].join("\n"),
      [
        "    signingConfigs {",
        "        debug {",
        "            storeFile file('debug.keystore')",
        "            storePassword 'android'",
        "            keyAlias 'androiddebugkey'",
        "            keyPassword 'android'",
        "        }",
        "        release {",
        "            if (keystorePropertiesFile.exists()) {",
        "                storeFile file(keystoreProperties['RELEASE_STORE_FILE'])",
        "                storePassword keystoreProperties['RELEASE_STORE_PASSWORD']",
        "                keyAlias keystoreProperties['RELEASE_KEY_ALIAS']",
        "                keyPassword keystoreProperties['RELEASE_KEY_PASSWORD']",
        "            }",
        "        }",
        "    }",
      ].join("\n"),
    );

    // 3. Replace signingConfig in release buildType only
    // The original template has TWO "signingConfig signingConfigs.debug":
    //   - one in debug buildType (keep as-is)
    //   - one in release buildType (change to use release signing)
    // We target the one inside "release {" by using surrounding context.
    contents = contents.replace(
      [
        "        release {",
        "            // Caution! In production, you need to generate your own keystore file.",
        "            // see https://reactnative.dev/docs/signed-apk-android.",
        "            signingConfig signingConfigs.debug",
      ].join("\n"),
      [
        "        release {",
        "            // Caution! In production, you need to generate your own keystore file.",
        "            // see https://reactnative.dev/docs/signed-apk-android.",
        "            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug",
      ].join("\n"),
    );

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
}

module.exports = withReleaseSigning;
