import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { feedQuerySchema, subjectFeedSchema, type SubjectFeed, type SubjectTag } from '@edu-feed/shared';

import type { AppQueues } from '../lib/queues.js';
import type { AppStore } from '../lib/store.js';

const feedRefreshRequestSchema = z.object({
  feed: subjectFeedSchema.default('history')
});

function feedToSubject(feed: SubjectFeed): SubjectTag | null {
  if (feed === 'country-knowledge') return 'country_knowledge';
  if (feed === 'videos') return 'video';
  if (feed === 'saved' || feed === 'community') return null;
  return feed;
}

export async function registerFeedRoutes(app: FastifyInstance, options: { store: AppStore; queues: AppQueues }) {
  app.get('/v1/feed', async (request) => {
    const parsed = feedQuerySchema.parse(request.query || {});
    return options.store.getFeed(parsed, request.currentUser?.username);
  });

  app.post('/v1/feed/refresh', async (request) => {
    const parsed = feedRefreshRequestSchema.parse(request.body || {});
    const targetSubject = feedToSubject(parsed.feed);
    const sources = await options.store.listSources();

    const eligibleSources = sources.filter((source) => {
      if (source.sourceType === 'community') return false;
      if (source.status === 'paused') return false;
      if (!targetSubject) return true;
      return source.subjects.includes(targetSubject);
    });

    const settled = await Promise.allSettled(
      eligibleSources.map((source) => options.queues.runSourceResync(source.id, source.feedUrl))
    );
    const queued = settled.filter((entry) => entry.status === 'fulfilled').length;
    const failed = settled.length - queued;

    if (failed > 0) {
      app.log.warn(
        {
          feed: parsed.feed,
          queued,
          failed
        },
        'Feed refresh queued with partial failures'
      );
    }

    return {
      ok: failed === 0,
      queued,
      failed,
      feed: parsed.feed,
      message:
        queued > 0
          ? `Queued ${queued} source refresh job${queued === 1 ? '' : 's'} for ${parsed.feed}.`
          : `No eligible sources found for ${parsed.feed}.`
    };
  });

  app.get('/v1/feed/stream', async (request, reply) => {
    const parsed = feedQuerySchema.parse(request.query || {});
    const snapshot = await options.store.getFeed(parsed, request.currentUser?.username);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform'
    });
    reply.raw.write(`event: snapshot\n`);
    reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    reply.raw.write(`event: done\n`);
    reply.raw.write(`data: {"ok":true}\n\n`);
    reply.raw.end();
    return reply;
  });

  app.get('/v1/sources', async () => {
    return {
      sources: await options.store.listSources()
    };
  });
}
