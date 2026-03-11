const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const isWin = process.platform === 'win32';

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000', () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(700, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureServer() {
  const running = await checkServerReady();
  if (running) return null;

  console.log('\n📦 Iniciando servidor web (puerto 3000)...\n');
  const npmCmd = isWin ? 'npm.cmd' : 'npm';
  const serverProcess = spawn(npmCmd, ['run', 'dev:server'], {
    stdio: 'inherit',
  });

  const maxAttempts = 45;
  for (let i = 0; i < maxAttempts; i += 1) {
    await wait(1000);
    // eslint-disable-next-line no-await-in-loop
    const ready = await checkServerReady();
    if (ready) {
      console.log('\n✅ Servidor web listo.\n');
      return serverProcess;
    }
  }

  console.log('\n⚠️ El servidor tardó más de lo esperado. Continuando con Expo...\n');
  return serverProcess;
}

async function main() {
  const expoArgs = process.argv.slice(2);
  const serverProcess = await ensureServer();

  const expoCliPath = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli');
  const finalExpoArgs = expoArgs.length > 0 ? expoArgs : ['start'];

  console.log(`📱 Iniciando Expo: expo ${finalExpoArgs.join(' ')}\n`);
  const expoProcess = spawn(process.execPath, [expoCliPath, ...finalExpoArgs], { stdio: 'inherit' });

  const cleanup = () => {
    if (serverProcess) serverProcess.kill();
    expoProcess.kill();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  expoProcess.on('exit', (code) => {
    if (serverProcess) serverProcess.kill();
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('\n❌ Error iniciando Expo + servidor:', err);
  process.exit(1);
});
