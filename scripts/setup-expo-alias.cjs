const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const binDir = path.join(root, 'node_modules', '.bin');

function writeIfPossible(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (err) {
    console.warn(`No se pudo escribir ${filePath}: ${err.message}`);
    return false;
  }
}

function main() {
  if (!fs.existsSync(binDir)) {
    console.warn('No existe node_modules/.bin todavía. Omitiendo parche de expo.');
    process.exit(0);
  }

  const cmdPath = path.join(binDir, 'expo.cmd');
  const shPath = path.join(binDir, 'expo');
  const ps1Path = path.join(binDir, 'expo.ps1');

  const cmdWrapper = `@ECHO off\r\nSETLOCAL\r\nSET "_root=%~dp0..\\.."\r\nnode "%_root%\\scripts\\expo-cli-wrapper.cjs" %*\r\n`;
  const shWrapper = `#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")\nroot="$basedir/../.."\nexec node "$root/scripts/expo-cli-wrapper.cjs" "$@"\n`;
  const ps1Wrapper = `#!/usr/bin/env pwsh\n$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\n$root=Join-Path $basedir "..\\.."\n& node (Join-Path $root "scripts\\expo-cli-wrapper.cjs") $args\nexit $LASTEXITCODE\n`;

  const okCmd = writeIfPossible(cmdPath, cmdWrapper);
  const okSh = writeIfPossible(shPath, shWrapper);
  const okPs1 = writeIfPossible(ps1Path, ps1Wrapper);

  if (okSh) {
    try {
      fs.chmodSync(shPath, 0o755);
    } catch (_) {
      // No-op on Windows
    }
  }

  if (okCmd || okSh || okPs1) {
    console.log('✅ Alias local de expo parcheado: npx expo start ahora inicia también el servidor web.');
  } else {
    console.warn('⚠️ No se pudo parchear alias de expo.');
  }
}

main();
