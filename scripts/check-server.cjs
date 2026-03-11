const http = require('http');

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000', () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

checkServer().then((running) => {
  if (!running) {
    console.log('\n⚠️ El servidor web NO está corriendo en http://localhost:3000\n');
    process.exit(1);
  }
  console.log('✅ Servidor web está corriendo\n');
  process.exit(0);
});
