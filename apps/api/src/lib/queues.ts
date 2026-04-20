import { Queue } from 'bullmq';
import IORedis from 'ioredis';

type IngestionJobPayload = {
  sourceId: string;
  feedUrl: string;
};

type NewsletterJobPayload = {
  username: string;
  mode: 'weekly' | 'daily';
};

export interface AppQueues {
  scheduleSource(sourceId: string, feedUrl: string, pollIntervalSec?: number): Promise<void>;
  runSourceResync(sourceId: string, feedUrl: string): Promise<void>;
  scheduleNewsletter(username: string, mode?: 'weekly' | 'daily'): Promise<void>;
  close(): Promise<void>;
}

export class NoopQueues implements AppQueues {
  async scheduleSource() {}

  async runSourceResync() {}

  async scheduleNewsletter() {}

  async close() {}
}

export class BullMqAppQueues implements AppQueues {
  private readonly connection: IORedis;

  private readonly ingestionQueue: Queue<IngestionJobPayload>;

  private readonly newsletterQueue: Queue<NewsletterJobPayload>;

  constructor(redisUrl: string) {
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null
    });
    this.ingestionQueue = new Queue<IngestionJobPayload>('ingestion', {
      connection: this.connection
    });
    this.newsletterQueue = new Queue<NewsletterJobPayload>('newsletter', {
      connection: this.connection
    });
  }

  async scheduleSource(sourceId: string, feedUrl: string, pollIntervalSec = 900) {
    await this.ingestionQueue.add(
      `source:${sourceId}`,
      {
        sourceId,
        feedUrl
      },
      {
        jobId: `source:${sourceId}`,
        repeat: {
          every: Math.max(pollIntervalSec, 60) * 1000
        },
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
  }

  async runSourceResync(sourceId: string, feedUrl: string) {
    await this.ingestionQueue.add(
      `source-resync:${sourceId}:${Date.now()}`,
      {
        sourceId,
        feedUrl
      },
      {
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
  }

  async scheduleNewsletter(username: string, mode: 'weekly' | 'daily' = 'weekly') {
    await this.newsletterQueue.add(
      `newsletter:${username}:${mode}`,
      {
        username,
        mode
      },
      {
        jobId: `newsletter:${username}:${mode}`,
        repeat: {
          every: mode === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
        },
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
  }

  async close() {
    await Promise.allSettled([this.ingestionQueue.close(), this.newsletterQueue.close()]);
    await this.connection.quit();
  }
}
