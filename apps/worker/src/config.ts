import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = path.resolve(moduleDir, '..', '..', '..', '.env');
const cwdEnvPath = path.resolve(process.cwd(), '.env');
const repoManagedEnvKeys = [
  'NODE_ENV',
  'APP_URL',
  'COOKIE_SECRET',
  'REDIS_URL',
  'DATABASE_URL',
  'DEMO_MODE',
  'WORKER_CONCURRENCY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'OLLAMA_BASE_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'ENABLE_EMAIL',
  'RUN_STARTUP_INGESTION',
  'INGESTION_FEED_ITEM_LIMIT',
  'INGESTION_ENRICHMENT_MAX_PER_RUN',
  'AI_ENRICHMENT_CONCURRENCY',
  'AI_PROMPT_BODY_CHAR_LIMIT'
];

function parseEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};
  const entries: Record<string, string> = {};
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

for (const key of repoManagedEnvKeys) {
  delete process.env[key];
}

Object.assign(process.env, parseEnvFile(repoRootEnvPath));
if (cwdEnvPath !== repoRootEnvPath) {
  Object.assign(process.env, parseEnvFile(cwdEnvPath));
}

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_SECRET: z.string().min(16).default('replace-with-a-long-random-string'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  DATABASE_URL: z.string().min(1),
  DEMO_MODE: z
    .string()
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OLLAMA_BASE_URL: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Fieldguide <noreply@example.com>'),
  ENABLE_EMAIL: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  RUN_STARTUP_INGESTION: z
    .string()
    .optional()
    .default('true')
    .transform((value) => value === 'true'),
  INGESTION_FEED_ITEM_LIMIT: z.coerce.number().int().positive().default(20),
  INGESTION_ENRICHMENT_MAX_PER_RUN: z.coerce.number().int().positive().default(6),
  AI_ENRICHMENT_CONCURRENCY: z.coerce.number().int().positive().default(1),
  AI_PROMPT_BODY_CHAR_LIMIT: z.coerce.number().int().positive().default(2200)
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function getWorkerConfig() {
  return workerEnvSchema.parse(process.env);
}
