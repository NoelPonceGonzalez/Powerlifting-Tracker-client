// Script para exponer el puerto 3000 a través de ngrok cuando uses Expo tunnel
const { spawn } = require('child_process');
const os = require('os');

console.log('\n🔧 Configurando túnel para el servidor Express (puerto 3000)...\n');

// Verificar si ngrok está instalado
const ngrokCheck = spawn('ngrok', ['version'], { shell: true });

ngrokCheck.on('error', () => {
  console.log('❌ ngrok no está instalado.\n');
  console.log('📦 Para instalar ngrok:');
  console.log('   1. Descarga desde: https://ngrok.com/download');
  console.log('   2. O instala con: npm install -g ngrok');
  console.log('\n💡 Alternativa: Usa "npm run expo:start" (LAN) en lugar de tunnel\n');
  process.exit(1);
});

ngrokCheck.on('close', (code) => {
  if (code === 0) {
    console.log('✅ ngrok encontrado. Iniciando túnel para puerto 3000...\n');
    console.log('⚠️  IMPORTANTE: Copia la URL "Forwarding" que aparece abajo\n');
    console.log('📝 Luego crea un archivo .env con:\n');
    console.log('   EXPO_PUBLIC_WEB_APP_URL=https://[URL_DE_NGROK]\n');
    
    const ngrok = spawn('ngrok', ['http', '3000'], { shell: true });
    
    ngrok.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      
      // Intentar extraer la URL de ngrok
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.ngrok(-free)?\.app/);
      if (urlMatch) {
        console.log(`\n✅ URL del túnel: ${urlMatch[0]}`);
        console.log(`\n📝 Añade esto a tu archivo .env:`);
        console.log(`   EXPO_PUBLIC_WEB_APP_URL=${urlMatch[0]}\n`);
      }
    });
    
    ngrok.stderr.on('data', (data) => {
      console.error(`ngrok: ${data}`);
    });
    
    ngrok.on('close', (code) => {
      console.log(`\n❌ ngrok terminó con código ${code}`);
    });
    
    // Manejar Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Cerrando túnel...');
      ngrok.kill();
      process.exit(0);
    });
  }
});
