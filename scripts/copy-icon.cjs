const fs = require('fs');
const path = require('path');
const src = path.join(process.env.USERPROFILE, '.cursor', 'projects', 'c-Users-noelp-Downloads-Powerlifting', 'assets', 'icon.png');
const dst = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(src)) { console.error('No icon at', src); process.exit(1); }
if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
fs.copyFileSync(src, path.join(dst, 'icon.png'));
fs.copyFileSync(src, path.join(dst, 'adaptive-icon.png'));
console.log('Icon copied.');
