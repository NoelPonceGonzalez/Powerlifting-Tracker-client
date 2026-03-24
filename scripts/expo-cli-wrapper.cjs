const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const firstArg = args[0];
const isStartLikeCommand =
  !firstArg ||
  firstArg === 'start' ||
  firstArg === '--android' ||
  firstArg === '--ios' ||
  firstArg === '--tunnel' ||
  firstArg === '--clear';

if (isStartLikeCommand) {
  const wrapperPath = path.join(__dirname, 'expo-start-wrapper.cjs');
  const forwardedArgs = firstArg === 'start' ? args : ['start', ...args];
  const proc = spawn(process.execPath, [wrapperPath, ...forwardedArgs], { stdio: 'inherit' });
  proc.on('exit', (code) => process.exit(code || 0));
} else {
  const expoCliPath = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli');
  const proc = spawn(process.execPath, [expoCliPath, ...args], { stdio: 'inherit' });
  proc.on('exit', (code) => process.exit(code || 0));
}
