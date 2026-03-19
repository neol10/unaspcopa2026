import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ports = [5174, 5175];

function safeExec(command) {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  } catch {
    return '';
  }
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function getListeningPidsWindows(port) {
  const out = safeExec(`netstat -ano -p tcp | findstr ":${port}"`);
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const pids = [];
  for (const line of lines) {
    // Example: TCP    0.0.0.0:5174   0.0.0.0:0   LISTENING   3720
    // Sometimes columns vary; we only care about LISTENING and trailing PID
    const match = line.match(/\bLISTENING\b\s+(\d+)$/i);
    if (match) pids.push(Number(match[1]));
  }
  return unique(pids).filter((pid) => Number.isFinite(pid) && pid > 0);
}

function killPidWindows(pid) {
  // /T kills child processes, /F forces
  safeExec(`taskkill /PID ${pid} /T /F`);
}

function getPidsUnix(port) {
  // Works on macOS/Linux when lsof is present.
  const out = safeExec(`lsof -ti tcp:${port}`);
  return unique(
    out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((v) => Number(v))
      .filter((pid) => Number.isFinite(pid) && pid > 0)
  );
}

function killPidUnix(pid) {
  safeExec(`kill -9 ${pid}`);
}

function killPorts() {
  const killed = [];

  for (const port of ports) {
    if (process.platform === 'win32') {
      const pids = getListeningPidsWindows(port);
      for (const pid of pids) {
        killPidWindows(pid);
        killed.push({ port, pid });
      }
    } else {
      const pids = getPidsUnix(port);
      for (const pid of pids) {
        killPidUnix(pid);
        killed.push({ port, pid });
      }
    }
  }

  return killed;
}

const killed = killPorts();
if (killed.length > 0) {
  const byPort = killed.reduce((acc, item) => {
    acc[item.port] ||= [];
    acc[item.port].push(item.pid);
    return acc;
  }, {});

  for (const [port, pids] of Object.entries(byPort)) {
    // eslint-disable-next-line no-console
    console.log(`[dev:clean] Porta ${port}: encerrado PID(s) ${unique(pids).join(', ')}`);
  }
} else {
  // eslint-disable-next-line no-console
  console.log('[dev:clean] Nenhum processo ouvindo em 5174/5175');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.resolve(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');

const child = spawn(process.execPath, [viteBin, '--port', '5174', '--strictPort'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
