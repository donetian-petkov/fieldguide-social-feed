import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

import { getWorkerConfig } from './config';
import { processAiEnrichmentJob, processIngestionJob, processNewsletterJob } from './jobs/processors';
import { QUEUES } from './jobs/types';

const config = getWorkerConfig();
const logger = pino({ name: 'fieldguide-worker' });

if (config.DEMO_MODE) {
  logger.info('Worker running in demo mode. Queue workers are not connected to Redis.');
  logger.info({
    queues: Object.values(QUEUES)
  }, 'Available queue names');

  setInterval(() => {
    logger.info('Demo worker heartbeat');
  }, 30_000);
} else {
  const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null
  });

  const queues = {
    ingestion: new Queue(QUEUES.ingestion, { connection }),
    aiEnrichment: new Queue(QUEUES.aiEnrichment, { connection }),
    newsletter: new Queue(QUEUES.newsletter, { connection })
  };

  new Worker(QUEUES.ingestion, async (job) => processIngestionJob(job.data), {
    connection,
    concurrency: config.WORKER_CONCURRENCY
  });

  new Worker(QUEUES.aiEnrichment, async (job) => processAiEnrichmentJob(job.data), {
    connection,
    concurrency: config.WORKER_CONCURRENCY
  });

  new Worker(QUEUES.newsletter, async (job) => processNewsletterJob(job.data), {
    connection,
    concurrency: 1
  });

  logger.info({
    queues: Object.keys(queues)
  }, 'Worker connected to Redis and processing jobs');
}
