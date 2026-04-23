import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

import { getWorkerConfig } from './config.js';
import {
  bootstrapRecurringJobs,
  processAiEnrichmentJob,
  processIngestionJob,
  processNewsletterJob,
  shutdownProcessorServices
} from './jobs/processors.js';
import { QUEUES } from './jobs/types.js';

const config = getWorkerConfig();
const logger = pino({ name: 'fieldguide-worker' });

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

  const queues = {
    ingestion: new Queue(QUEUES.ingestion, { connection }),
    aiEnrichment: new Queue(QUEUES.aiEnrichment, { connection }),
    newsletter: new Queue(QUEUES.newsletter, { connection })
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
      logger.error({ jobId: job?.id, queue: worker.name, error }, 'Worker job failed');
    });
  });

  logger.info({
    queues: Object.keys(queues)
  }, 'Worker connected to Redis, scheduled recurring jobs, and processing jobs');
}

main().catch((error) => {
  logger.error({ error }, 'Worker failed to start');
  process.exit(1);
});
