// Script que crea un alias para que 'npx expo start' ejecute automáticamente el wrapper
const fs = require('fs');
const path = require('path');

// Crear un script en node_modules/.bin que intercepte expo start
const nodeModulesBin = path.join(__dirname, '..', 'node_modules', '.bin');
const expoWrapperPath = path.join(nodeModulesBin, 'expo-wrapper');

// Crear el directorio si no existe
if (!fs.existsSync(nodeModulesBin)) {
  fs.mkdirSync(nodeModulesBin, { recursive: true });
}

// Crear un script wrapper que intercepte expo start
const wrapperScript = `#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

if (args[0] === 'start') {
  // Si es 'expo start', usar nuestro wrapper
  const wrapperPath = path.join(__dirname, '..', '..', 'scripts', 'expo-start-wrapper.js');
  const wrapperProcess = spawn('node', [wrapperPath], {
    shell: true,
    stdio: 'inherit'
  });
  wrapperProcess.on('exit', process.exit);
} else {
  // Para otros comandos, ejecutar expo normalmente
  const expoProcess = spawn('npx', ['expo', ...args], {
    shell: true,
    stdio: 'inherit'
  });
  expoProcess.on('exit', process.exit);
}
`;

// No hacer nada automáticamente, solo crear el script si el usuario lo necesita
// El usuario puede usar 'npm run expo start' que funcionará igual que 'npx expo start'
