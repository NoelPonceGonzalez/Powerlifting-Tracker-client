const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Equivalente en Expo al setup Gradle de Firebase (BoM + Analytics).
 * El plugin `com.google.gms.google-services` y `apply plugin` ya los añade Expo
 * cuando `expo.android.googleServicesFile` está definido.
 *
 * @see https://firebase.google.com/docs/android/setup
 */
function withFirebaseAndroidSdk(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    // Alinear con la guía de Firebase (plugin Gradle 4.4.4)
    if (contents.includes('com.google.gms:google-services:4.4.1')) {
      contents = contents.replace(
        "classpath 'com.google.gms:google-services:4.4.1'",
        "classpath 'com.google.gms:google-services:4.4.4'"
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes('firebase-bom')) {
      return cfg;
    }
    const marker = 'implementation("com.facebook.react:react-android")';
    if (!contents.includes(marker)) {
      return cfg;
    }
    const addition = `\n\n    // Firebase BoM + Analytics (Firebase Console → Gradle)
    implementation platform('com.google.firebase:firebase-bom:34.11.0')
    implementation 'com.google.firebase:firebase-analytics'`;
    contents = contents.replace(marker, `${marker}${addition}`);
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = withFirebaseAndroidSdk;
