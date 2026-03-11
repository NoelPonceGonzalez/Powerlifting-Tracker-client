#!/usr/bin/env node
// Este script intercepta comandos de expo y automáticamente inicia el servidor si es 'start'
const { spawn } = require('child_process');
const path = require('path');

// Obtener todos los argumentos (remover 'node' y el nombre del script)
const args = process.argv.slice(2);

// Si el primer argumento es 'start' (o 'start' con flags como --android, --ios, --tunnel)
const isStartCommand = args[0] === 'start' || 
                       args[0] === 'start:only' ||
                       (args.length > 0 && args[0].startsWith('start'));

if (isStartCommand) {
  // Si es 'expo start', usar el wrapper que inicia el servidor automáticamente
  const wrapperPath = path.join(__dirname, 'expo-start-wrapper.js');
  const wrapperProcess = spawn('node', [wrapperPath], {
    shell: true,
    stdio: 'inherit'
  });
  
  wrapperProcess.on('exit', process.exit);
  return;
}

// Para cualquier otro comando de expo (android, ios, tunnel, etc.), ejecutar expo normalmente
const expoProcess = spawn('npx', ['expo', ...args], {
  shell: true,
  stdio: 'inherit'
});

expoProcess.on('exit', process.exit);
