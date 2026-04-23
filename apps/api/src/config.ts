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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1).default('mysql://fieldguide:fieldguide@127.0.0.1:3306/fieldguide'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  COOKIE_SECRET: z.string().min(16).default('replace-with-a-long-random-string'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  MODE_SWITCH_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  DEMO_MODE: z
    .string()
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
  DEFAULT_AI_PROVIDER: z.enum(['openai', 'anthropic', 'openrouter']).default('openai'),
  SUMMARY_MODEL: z.string().default('gpt-4.1-mini'),
  TRANSLATION_MODEL: z.string().default('gpt-4.1-mini'),
  ASK_MODEL: z.string().default('gpt-4.1-mini'),
  NEWSLETTER_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  ENABLE_EMAIL: z
    .string()
    .optional()
    .transform((value) => value === 'true')
});

export type AppConfig = z.infer<typeof envSchema>;

export function getConfig() {
  return envSchema.parse(process.env);
}
