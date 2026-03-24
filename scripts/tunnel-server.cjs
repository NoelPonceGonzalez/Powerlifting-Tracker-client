const { spawn } = require('child_process');

console.log('\n🔧 Configurando túnel para el servidor Express (puerto 3000)...\n');

const ngrokCheck = spawn('ngrok', ['version'], { shell: true });

ngrokCheck.on('error', () => {
  console.log('❌ ngrok no está instalado.\n');
  console.log('📦 Descarga: https://ngrok.com/download');
  console.log('   o instala con: npm install -g ngrok\n');
  process.exit(1);
});

ngrokCheck.on('close', (code) => {
  if (code !== 0) {
    console.log('❌ ngrok no está disponible en PATH');
    process.exit(1);
  }

  console.log('✅ ngrok encontrado. Iniciando túnel para puerto 3000...\n');
  const ngrok = spawn('ngrok', ['http', '3000'], { shell: true, stdio: 'pipe' });

  ngrok.stdout.on('data', (data) => {
    const output = data.toString();
    process.stdout.write(output);
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.ngrok(-free)?\.app/i);
    if (urlMatch) {
      console.log(`\n📝 Pon esto en .env:\nEXPO_PUBLIC_WEB_APP_URL=${urlMatch[0]}\n`);
    }
  });

  ngrok.stderr.on('data', (data) => process.stderr.write(data.toString()));
  ngrok.on('close', (exitCode) => console.log(`\nngrok terminó con código ${exitCode}`));

  process.on('SIGINT', () => {
    ngrok.kill();
    process.exit(0);
  });
});
