import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

import { getWorkerConfig } from './config.js';
import {
  bootstrapRecurringJobs,
  processAiEnrichmentJob,
  processGeneratedStoryJob,
  processIngestionJob,
  processNewsletterJob,
  waitForProcessorServicesReady,
  shutdownProcessorServices
} from './jobs/processors.js';
import { QUEUES } from './jobs/types.js';

const config = getWorkerConfig();
const logger = pino({ name: 'fieldguide-worker' });
const STARTUP_RETRY_DELAY_MS = 3_000;
const STARTUP_MAX_ATTEMPTS = 20;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDependencyStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Can't reach database server/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /connect ECONNREFUSED/i.test(message) ||
    /Connection is closed/i.test(message) ||
    /All sentinels are unreachable/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /connection is not ready/i.test(message)
  );
}

async function waitForDependency(name: string, check: () => Promise<void>) {
  for (let attempt = 1; attempt <= STARTUP_MAX_ATTEMPTS; attempt += 1) {
    try {
      await check();
      if (attempt > 1) {
        logger.info({ dependency: name, attempt }, 'Dependency became ready');
      }
      return;
    } catch (error) {
      const dependencyError = isDependencyStartupError(error);
      logger.warn(
        {
          dependency: name,
          attempt,
          maxAttempts: STARTUP_MAX_ATTEMPTS,
          err: error
        },
        dependencyError && attempt < STARTUP_MAX_ATTEMPTS
          ? 'Dependency not ready yet; retrying startup'
          : 'Dependency readiness check failed'
      );
      if (!dependencyError || attempt >= STARTUP_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(STARTUP_RETRY_DELAY_MS);
    }
  }
}

async function main() {
  if (config.DEMO_MODE) {
    logger.info('Worker running in demo mode. Queue workers are not connected to Redis.');
    logger.info({
      queues: Object.values(QUEUES)
    }, 'Available queue names');

    setInterval(() => {
      logger.info('Demo worker heartbeat');
    }, 30_000);
    return;
  }

  const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null
  });

  await waitForDependency('redis', async () => {
    await connection.ping();
  });
  await waitForDependency('database', async () => {
    await waitForProcessorServicesReady();
  });

  const queues = {
    ingestion: new Queue(QUEUES.ingestion, { connection }),
    aiEnrichment: new Queue(QUEUES.aiEnrichment, { connection }),
    newsletter: new Queue(QUEUES.newsletter, { connection }),
    generatedStory: new Queue(QUEUES.generatedStory, { connection })
  };

  const workers = [
    new Worker(QUEUES.ingestion, async (job) => processIngestionJob(job.data), {
      connection,
      concurrency: config.WORKER_CONCURRENCY
    }),
    new Worker(QUEUES.aiEnrichment, async (job) => processAiEnrichmentJob(job.data), {
      connection,
      concurrency: config.WORKER_CONCURRENCY
    }),
    new Worker(QUEUES.newsletter, async (job) => processNewsletterJob(job.data), {
      connection,
      concurrency: 1
    }),
    new Worker(QUEUES.generatedStory, async (job) => processGeneratedStoryJob(job.data), {
      connection,
      concurrency: 1
    })
  ];

  await bootstrapRecurringJobs({
    ingestion: queues.ingestion,
    newsletter: queues.newsletter
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker');
    await Promise.allSettled([
      ...workers.map((worker) => worker.close()),
      ...Object.values(queues).map((queue) => queue.close()),
      connection.quit(),
      shutdownProcessorServices()
    ]);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  workers.forEach((worker) => {
    worker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, queue: worker.name, err: error }, 'Worker job failed');
    });
  });

  logger.info({
    queues: Object.keys(queues)
  }, 'Worker connected to Redis, scheduled recurring jobs, and processing jobs');
}

main().catch((error) => {
  logger.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});
