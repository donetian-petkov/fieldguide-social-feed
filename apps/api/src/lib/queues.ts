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

type GeneratedStoryJobPayload = {
  draftId: string;
};

export interface AppQueues {
  scheduleSource(sourceId: string, feedUrl: string, pollIntervalSec?: number): Promise<void>;
  runSourceResync(sourceId: string, feedUrl: string): Promise<void>;
  removeSourceSchedule(sourceId: string): Promise<void>;
  generateStoryDraft(draftId: string): Promise<void>;
  scheduleNewsletter(username: string, mode?: 'weekly' | 'daily'): Promise<void>;
  syncNewsletterSchedule(username: string, enabled: boolean, mode?: 'weekly' | 'daily'): Promise<void>;
  close(): Promise<void>;
}

export class NoopQueues implements AppQueues {
  async scheduleSource() {}

  async runSourceResync() {}

  async removeSourceSchedule() {}

  async generateStoryDraft() {}

  async scheduleNewsletter() {}

  async syncNewsletterSchedule() {}

  async close() {}
}

export class BullMqAppQueues implements AppQueues {
  private readonly connection: IORedis;

  private readonly ingestionQueue: Queue<IngestionJobPayload>;

  private readonly newsletterQueue: Queue<NewsletterJobPayload>;

  private readonly generatedStoryQueue: Queue<GeneratedStoryJobPayload>;

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
    this.generatedStoryQueue = new Queue<GeneratedStoryJobPayload>('generated-story', {
      connection: this.connection
    });
  }

  async scheduleSource(sourceId: string, feedUrl: string, pollIntervalSec = 3600) {
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

  async removeSourceSchedule(sourceId: string) {
    const repeatableJobs = await this.ingestionQueue.getRepeatableJobs();
    await Promise.all(
      repeatableJobs
        .filter((job) => job.id === `source:${sourceId}`)
        .map((job) => this.ingestionQueue.removeRepeatableByKey(job.key))
    );
  }

  async generateStoryDraft(draftId: string) {
    await this.generatedStoryQueue.add(
      `generated-story:${draftId}`,
      {
        draftId
      },
      {
        jobId: `generated-story-${draftId}`, // BullMQ rejects custom ids with a single colon
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

  async syncNewsletterSchedule(username: string, enabled: boolean, mode: 'weekly' | 'daily' = 'weekly') {
    const repeatableJobs = await this.newsletterQueue.getRepeatableJobs();
    await Promise.all(
      repeatableJobs
        .filter((job) => job.id === `newsletter:${username}:daily` || job.id === `newsletter:${username}:weekly`)
        .map((job) => this.newsletterQueue.removeRepeatableByKey(job.key))
    );

    if (enabled) {
      await this.scheduleNewsletter(username, mode);
    }
  }

  async close() {
    await Promise.allSettled([this.ingestionQueue.close(), this.newsletterQueue.close(), this.generatedStoryQueue.close()]);
    await this.connection.quit();
  }
}
