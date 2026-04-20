import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';

import type { UserSettingsDto } from '@edu-feed/shared';

import { getConfig } from './config';
import { DemoStore } from './lib/demo-store';
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

const store = new DemoStore({
  sessionTtlHours: config.SESSION_TTL_HOURS,
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
  request.currentUser = store.getCurrentUser(request.cookies.fieldguide_session);
});

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error.message.includes('Authentication') ? 401 : error.message.includes('Admin') ? 403 : 400;
  reply.code(statusCode).send({
    error: error.message
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

app.listen({
  host: '0.0.0.0',
  port: config.PORT
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
