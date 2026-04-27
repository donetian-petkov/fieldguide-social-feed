import { mkdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootEnvPath = path.join(rootDir, '.env');
const mode = process.argv[2];
const repoManagedEnvKeys = [
  'NODE_ENV',
  'APP_NAME',
  'APP_URL',
  'API_URL',
  'WORKER_CONCURRENCY',
  'PORT',
  'WEB_PORT',
  'DATABASE_URL',
  'SHADOW_DATABASE_URL',
  'REDIS_URL',
  'COOKIE_SECRET',
  'SESSION_TTL_HOURS',
  'MODE_SWITCH_TTL_MINUTES',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'DEFAULT_AI_PROVIDER',
  'SUMMARY_MODEL',
  'TRANSLATION_MODEL',
  'ASK_MODEL',
  'NEWSLETTER_MODEL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'ENABLE_EMAIL',
  'DEMO_MODE',
  'SEED_USER_PASSWORD',
  'SEED_DEMO_CONTENT',
  'NEXT_PUBLIC_API_URL',
  'AUTO_SHUTDOWN_ENABLED',
  'AUTO_SHUTDOWN_IDLE_HOURS',
  'STACK_ACTIVITY_FILE',
  'NEXT_PUBLIC_DEMO_FALLBACK',
  'NEXT_PUBLIC_ENABLE_DEMO_FALLBACK'
];
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
let autoShutdownInterval = null;

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

function buildManagedEnv(baseEnv, ...layers) {
  const env = { ...baseEnv };
  for (const key of repoManagedEnvKeys) {
    delete env[key];
  }
  for (const layer of layers) {
    Object.assign(env, layer);
  }
  return env;
}

const env = buildManagedEnv(process.env, parseEnvFile(rootEnvPath));
const shouldManageDocker = env.DEMO_MODE !== 'true';
const runtimeDir = path.join(rootDir, '.runtime');
const activityFile = env.STACK_ACTIVITY_FILE || path.join(runtimeDir, 'stack-activity.json');
const autoShutdownEnabled = env.AUTO_SHUTDOWN_ENABLED !== 'false';
const autoShutdownIdleHours = Number(env.AUTO_SHUTDOWN_IDLE_HOURS || '4');
const autoShutdownIdleMs =
  Number.isFinite(autoShutdownIdleHours) && autoShutdownIdleHours > 0 ? autoShutdownIdleHours * 60 * 60 * 1000 : 0;
env.STACK_ACTIVITY_FILE = activityFile;
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

function writeActivityFile() {
  mkdirSync(path.dirname(activityFile), { recursive: true });
  writeFileSync(activityFile, JSON.stringify({ updatedAt: new Date().toISOString() }), 'utf8');
}

function activityAgeMs() {
  try {
    return Date.now() - statSync(activityFile).mtimeMs;
  } catch {
    return 0;
  }
}

function startAutoShutdownMonitor() {
  if (!autoShutdownEnabled || autoShutdownIdleMs <= 0) {
    log('Idle auto-shutdown disabled.');
    return;
  }

  writeActivityFile();
  log(`Idle auto-shutdown armed for ${autoShutdownIdleHours} hour(s) without user activity.`);
  autoShutdownInterval = setInterval(() => {
    if (shuttingDown) {
      return;
    }
    if (activityAgeMs() < autoShutdownIdleMs) {
      return;
    }
    log(`No recorded user activity for ${autoShutdownIdleHours} hour(s); shutting the stack down.`);
    void cleanup(0);
  }, 60_000);
  autoShutdownInterval.unref?.();
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
  if (autoShutdownInterval) {
    clearInterval(autoShutdownInterval);
    autoShutdownInterval = null;
  }

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
  startAutoShutdownMonitor();
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
