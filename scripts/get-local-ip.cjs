const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

const ips = getLocalIP();
console.log('\n📱 IPs locales disponibles para dispositivos físicos:\n');
if (ips.length === 0) {
  console.log('❌ No se encontraron IPs locales');
} else {
  ips.forEach(({ name, address }) => console.log(`   ${name}: http://${address}:3000`));
}
console.log('\n💡 Usa una de estas IPs en EXPO_PUBLIC_WEB_APP_URL\n');
