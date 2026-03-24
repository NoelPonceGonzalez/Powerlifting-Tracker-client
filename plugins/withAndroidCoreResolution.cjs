const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Fuerza androidx.core a 1.15.0 para evitar requerir compileSdk 36 y AGP 8.9.1.
 * Las versiones 1.17.0 requieren SDK 36 y AGP 8.9.1, que pueden causar incompatibilidades.
 */
function withAndroidCoreResolution(config) {
  return withProjectBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    if (buildGradle.includes("force 'androidx.core:core-ktx:1.15.0'")) {
      return config;
    }

    const resolutionBlock = `
    configurations.all {
        resolutionStrategy {
            force 'androidx.core:core-ktx:1.15.0'
            force 'androidx.core:core:1.15.0'
        }
    }
`;

    // Insertar dentro de allprojects { }, justo después del opening brace
    const allprojectsRegex = /(allprojects\s*\{)\s*(\n)/;
    const match = buildGradle.match(allprojectsRegex);
    if (match) {
      const insertPos = match.index + match[1].length;
      buildGradle =
        buildGradle.slice(0, insertPos) +
        resolutionBlock +
        buildGradle.slice(insertPos);
    }

    config.modResults.contents = buildGradle;
    return config;
  });
}

module.exports = withAndroidCoreResolution;
