import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootEnvPath = path.join(rootDir, '.env');
const mode = process.argv[2];
const servicesByMode = {
  dev: [
    { name: 'api', cwd: path.join(rootDir, 'apps/api'), command: 'tsx', args: ['watch', 'src/server.ts'] },
    { name: 'worker', cwd: path.join(rootDir, 'apps/worker'), command: 'tsx', args: ['watch', 'src/index.ts'] },
    { name: 'web', cwd: path.join(rootDir, 'apps/web'), command: 'next', args: ['dev', '-p', '3000'] }
  ],
  start: [
    { name: 'api', cwd: path.join(rootDir, 'apps/api'), command: 'node', args: ['dist/server.js'] },
    { name: 'worker', cwd: path.join(rootDir, 'apps/worker'), command: 'node', args: ['dist/index.js'] },
    { name: 'web', cwd: path.join(rootDir, 'apps/web'), command: 'next', args: ['start', '-p', '3000'] }
  ]
};
const children = [];
let shuttingDown = false;

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const entries = {};
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

const env = { ...parseEnvFile(rootEnvPath), ...process.env };
const shouldManageDocker = env.DEMO_MODE !== 'true';
env.PATH = [
  path.join(rootDir, 'node_modules', '.bin'),
  env.PATH
].filter(Boolean).join(path.delimiter);

if (!['dev', 'start'].includes(mode)) {
  console.error('Usage: node scripts/run-stack.mjs <dev|start>');
  process.exit(1);
}

function log(message) {
  console.log(`[stack] ${message}`);
}

function resolveCommand(command) {
  if (process.platform === 'win32' && !command.includes(path.sep) && command !== 'node' && command !== 'docker') {
    return `${command}.cmd`;
  }
  return command;
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, {
      cwd: rootDir,
      env,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${label} exited with code ${code ?? 'unknown'}`));
    });
  });
}

function killChildTree(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function cleanup(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  log('Stopping services...');
  for (const child of children) {
    killChildTree(child, 'SIGTERM');
  }

  await new Promise((resolve) => setTimeout(resolve, 800));

  for (const child of children) {
    killChildTree(child, 'SIGKILL');
  }

  if (shouldManageDocker) {
    log('Stopping Docker dependencies...');
    try {
      await runCommand('docker', ['compose', 'down'], 'docker compose down');
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  process.exit(exitCode);
}

function spawnService(service) {
  const child = spawn(resolveCommand(service.command), service.args, {
    cwd: service.cwd,
    env,
    stdio: 'inherit',
    detached: process.platform !== 'win32'
  });

  children.push(child);
  child.on('error', async (error) => {
    console.error(`[stack] ${service.name} failed to start`, error);
    await cleanup(1);
  });
  child.on('exit', async (code, signal) => {
    if (shuttingDown) return;
    console.error(`[stack] ${service.name} exited (${signal || code || 'unknown'}).`);
    await cleanup(typeof code === 'number' ? code : 1);
  });
}

async function main() {
  if (shouldManageDocker) {
    log('Starting Docker dependencies...');
    await runCommand('docker', ['compose', 'up', '-d', '--wait'], 'docker compose up -d --wait');
  } else {
    log('Skipping Docker startup because DEMO_MODE=true.');
  }

  log(`Starting ${mode} services...`);
  for (const service of servicesByMode[mode]) {
    spawnService(service);
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    void cleanup(0);
  });
}

process.on('uncaughtException', (error) => {
  console.error(error);
  void cleanup(1);
});

process.on('unhandledRejection', (error) => {
  console.error(error);
  void cleanup(1);
});

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await cleanup(1);
});
