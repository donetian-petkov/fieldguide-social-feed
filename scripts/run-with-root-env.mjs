import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootEnvPath = path.join(rootDir, '.env');
const localEnvPath = path.join(process.cwd(), '.env');
const [command, ...args] = process.argv.slice(2);
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
  'OLLAMA_BASE_URL',
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
  'NEXT_PUBLIC_DEMO_FALLBACK',
  'NEXT_PUBLIC_ENABLE_DEMO_FALLBACK'
];

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

if (!command) {
  console.error('Usage: node scripts/run-with-root-env.mjs <command> [...args]');
  process.exit(1);
}

const env = buildManagedEnv(
  process.env,
  parseEnvFile(rootEnvPath),
  localEnvPath !== rootEnvPath ? parseEnvFile(localEnvPath) : {}
);

env.PATH = [
  path.join(process.cwd(), 'node_modules', '.bin'),
  path.join(rootDir, 'node_modules', '.bin'),
  env.PATH
].filter(Boolean).join(path.delimiter);

const child = spawn(command, args, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
