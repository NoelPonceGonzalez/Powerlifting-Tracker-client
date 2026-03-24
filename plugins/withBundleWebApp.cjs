const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Plugin que empaqueta la web app (Vite build) dentro del APK.
 * Así la app funciona sin depender de un servidor local - carga el HTML/JS/CSS desde assets.
 */
function withBundleWebApp(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const distPath = path.join(projectRoot, 'dist');
      const assetsTarget = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
        'webapp'
      );

      console.log('[withBundleWebApp] Construyendo web app con Vite...');
      try {
        execSync('npm run build', {
          cwd: projectRoot,
          stdio: 'inherit',
        });
      } catch (err) {
        console.error('[withBundleWebApp] Error al ejecutar npm run build:', err.message);
        throw new Error('No se pudo construir la web app. Ejecuta "npm run build" manualmente.');
      }

      if (!fs.existsSync(distPath)) {
        throw new Error('La carpeta dist no existe después del build. Verifica vite.config.ts.');
      }

      // Crear carpeta de destino
      if (!fs.existsSync(assetsTarget)) {
        fs.mkdirSync(assetsTarget, { recursive: true });
      }

      // Copiar dist/index.html y dist/assets/* a assets/webapp/
      const indexSrc = path.join(distPath, 'index.html');
      const assetsSrc = path.join(distPath, 'assets');

      if (fs.existsSync(indexSrc)) {
        fs.copyFileSync(indexSrc, path.join(assetsTarget, 'index.html'));
        console.log('[withBundleWebApp] Copiado index.html');
      }

      if (fs.existsSync(assetsSrc)) {
        const assetsTargetDir = path.join(assetsTarget, 'assets');
        if (!fs.existsSync(assetsTargetDir)) {
          fs.mkdirSync(assetsTargetDir, { recursive: true });
        }
        const files = fs.readdirSync(assetsSrc);
        for (const f of files) {
          const src = path.join(assetsSrc, f);
          const dest = path.join(assetsTargetDir, f);
          fs.copyFileSync(src, dest);
        }
        console.log('[withBundleWebApp] Copiados', files.length, 'archivos en assets/');
      }

      console.log('[withBundleWebApp] Web app empaquetada en', assetsTarget);
      return config;
    },
  ]);
}

module.exports = withBundleWebApp;
