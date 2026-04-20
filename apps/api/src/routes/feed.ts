import type { FastifyInstance } from 'fastify';

import { feedQuerySchema } from '@edu-feed/shared';

import type { AppStore } from '../lib/store.js';

export async function registerFeedRoutes(app: FastifyInstance, options: { store: AppStore }) {
  app.get('/v1/feed', async (request) => {
    const parsed = feedQuerySchema.parse(request.query || {});
    return options.store.getFeed(parsed, request.currentUser?.username);
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
