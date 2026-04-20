import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  DATABASE_URL: z.string().min(1),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  ENABLE_EMAIL: z
    .string()
    .optional()
    .transform((value) => value === 'true')
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function getWorkerConfig() {
  return workerEnvSchema.parse(process.env);
}
