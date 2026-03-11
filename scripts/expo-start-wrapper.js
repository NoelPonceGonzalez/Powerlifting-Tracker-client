// Wrapper script para iniciar servidor + Expo cuando uses npm run expo:start
const { spawn } = require('child_process');
const http = require('http');

console.log('\n🚀 Iniciando servidor web y Expo...\n');

// Verificar si el servidor ya está corriendo
function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000', (res) => {
      resolve(true);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  // Verificar si el servidor ya está corriendo
  const serverRunning = await checkServerReady();
  
  let serverProcess = null;
  
  if (!serverRunning) {
    console.log('📦 Iniciando servidor web...\n');
    // Iniciar servidor web en background (usar dev:server para evitar loops)
    serverProcess = spawn('npm', ['run', 'dev:server'], {
      shell: true,
      stdio: 'inherit',
      detached: false
    });

    // Esperar a que el servidor esté listo
    console.log('⏳ Esperando a que el servidor esté listo...');
    let attempts = 0;
    const maxAttempts = 30; // 30 segundos máximo

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const ready = await checkServerReady();
      if (ready) {
        console.log('✅ Servidor web listo!\n');
        break;
      }
      attempts++;
      if (attempts % 5 === 0) {
        process.stdout.write('.');
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⚠️  El servidor no respondió a tiempo, pero continuando...\n');
    } else {
      console.log('');
    }
  } else {
    console.log('✅ Servidor web ya está corriendo\n');
  }
  
  console.log('📱 Iniciando Expo...\n');
  
  // Iniciar Expo
  const expoProcess = spawn('npx', ['expo', 'start'], {
    shell: true,
    stdio: 'inherit'
  });

  // Manejar Ctrl+C para cerrar ambos procesos
  const cleanup = () => {
    console.log('\n\n🛑 Cerrando procesos...');
    if (serverProcess) {
      serverProcess.kill();
    }
    expoProcess.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  expoProcess.on('exit', (code) => {
    if (serverProcess) {
      serverProcess.kill();
    }
    process.exit(code);
  });
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
