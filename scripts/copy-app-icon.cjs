#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const src = path.join(process.env.USERPROFILE || process.env.HOME, '.cursor', 'projects', 'c-Users-noelp-Downloads-Powerlifting', 'assets', 'icon.png');
const destDir = path.join(__dirname, '..', 'assets');
const destIcon = path.join(destDir, 'icon.png');
const destAdaptive = path.join(destDir, 'adaptive-icon.png');

if (!fs.existsSync(src)) {
  console.error('Icono no encontrado en:', src);
  process.exit(1);
}
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, destIcon);
fs.copyFileSync(src, destAdaptive);
console.log('Icono copiado correctamente.');
