import type { FastifyInstance } from 'fastify';

import { feedQuerySchema } from '@edu-feed/shared';

import { DemoStore } from '../lib/demo-store';

export async function registerFeedRoutes(app: FastifyInstance, options: { store: DemoStore }) {
  app.get('/v1/feed', async (request) => {
    const parsed = feedQuerySchema.parse(request.query || {});
    return options.store.getFeed(parsed, request.currentUser?.username);
  });

  app.get('/v1/feed/stream', async (request, reply) => {
    const parsed = feedQuerySchema.parse(request.query || {});
    const snapshot = options.store.getFeed(parsed, request.currentUser?.username);
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
      sources: options.store.listSources()
    };
  });
}
