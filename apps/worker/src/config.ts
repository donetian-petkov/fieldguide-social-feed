import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = path.resolve(moduleDir, '..', '..', '..', '.env');
const cwdEnvPath = path.resolve(process.cwd(), '.env');

loadEnv({ path: repoRootEnvPath });
if (cwdEnvPath !== repoRootEnvPath) {
  loadEnv({ path: cwdEnvPath, override: true });
}

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
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
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Fieldguide <noreply@example.com>'),
  ENABLE_EMAIL: z
    .string()
    .optional()
    .transform((value) => value === 'true')
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function getWorkerConfig() {
  return workerEnvSchema.parse(process.env);
}
