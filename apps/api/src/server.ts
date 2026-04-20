import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';

import type { UserSettingsDto } from '@edu-feed/shared';

import { getConfig } from './config';
import { DemoStore } from './lib/demo-store';
import type { AppStore } from './lib/store';
import { PrismaStore } from './lib/prisma-store';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthRoutes } from './routes/auth';
import { registerFeedRoutes } from './routes/feed';
import { registerItemRoutes } from './routes/items';
import { registerMeRoutes } from './routes/me';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: UserSettingsDto | null;
  }
}

const config = getConfig();
const app = Fastify({
  logger: true
});

const prisma = config.DEMO_MODE ? null : new PrismaClient();
const store: AppStore = config.DEMO_MODE
  ? new DemoStore({
      sessionTtlHours: config.SESSION_TTL_HOURS,
      modeSwitchTtlMinutes: config.MODE_SWITCH_TTL_MINUTES,
      appUrl: config.APP_URL
    })
  : new PrismaStore(prisma!, {
      modeSwitchTtlMinutes: config.MODE_SWITCH_TTL_MINUTES,
      appUrl: config.APP_URL
    });

await app.register(cors, {
  origin: true,
  credentials: true
});
await app.register(cookie, {
  secret: config.COOKIE_SECRET
});

app.addHook('preHandler', async (request) => {
  request.currentUser = await store.getCurrentUser(request.cookies.fieldguide_session);
});

app.setErrorHandler((error, _request, reply) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const statusCode = message.includes('Authentication') ? 401 : message.includes('Admin') ? 403 : 400;
  reply.code(statusCode).send({
    error: message
  });
});

app.get('/health', async () => ({
  ok: true,
  mode: config.DEMO_MODE ? 'demo' : 'database',
  uptime: process.uptime()
}));

await registerAuthRoutes(app, { store, config });
await registerFeedRoutes(app, { store });
await registerItemRoutes(app, { store });
await registerMeRoutes(app, { store });
await app.register(async (instance) => registerAdminRoutes(instance, { store }), { prefix: '' });

app.addHook('onClose', async () => {
  if (store.disconnect) {
    await store.disconnect();
  }
});

app.listen({
  host: '0.0.0.0',
  port: config.PORT
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
