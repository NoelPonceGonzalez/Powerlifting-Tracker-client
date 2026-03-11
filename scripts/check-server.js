// Script para verificar si el servidor está corriendo
const http = require('http');

function checkServer() {
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

checkServer().then((running) => {
  if (!running) {
    console.log('\n⚠️  El servidor web NO está corriendo en http://localhost:3000\n');
    console.log('💡 Para iniciar todo automáticamente, usa:');
    console.log('   npm run expo:start\n');
    console.log('   O inicia el servidor manualmente en otra terminal:');
    console.log('   npm run dev\n');
    process.exit(1);
  } else {
    console.log('✅ Servidor web está corriendo\n');
    process.exit(0);
  }
});
