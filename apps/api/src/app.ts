import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';

import type { UserSettingsDto } from '@edu-feed/shared';

import { getConfig, type AppConfig } from './config.js';
import { hasProviderKey } from './lib/ai-runtime.js';
import { DemoStore } from './lib/demo-store.js';
import { BullMqAppQueues, NoopQueues, type AppQueues } from './lib/queues.js';
import type { AppStore } from './lib/store.js';
import { PrismaStore } from './lib/prisma-store.js';
import { ensureDefaultSourceRegistry } from './lib/source-registry.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerFeedRoutes } from './routes/feed.js';
import { registerItemRoutes } from './routes/items.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerMeRoutes } from './routes/me.js';
import { registerRuntimeRoutes } from './routes/runtime.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: UserSettingsDto | null;
  }
}

export async function buildApp(options?: {
  config?: AppConfig;
  store?: AppStore;
  queues?: AppQueues;
}) {
  const config = options?.config || getConfig();
  const app = Fastify({
    logger: config.NODE_ENV !== 'test'
  });

  const prisma = options?.store || config.DEMO_MODE ? null : new PrismaClient();
  const queues =
    options?.queues || (config.DEMO_MODE ? new NoopQueues() : new BullMqAppQueues(config.REDIS_URL));
  if (prisma) {
    await ensureDefaultSourceRegistry(prisma);
  }
  const store: AppStore =
    options?.store ||
    (config.DEMO_MODE
      ? new DemoStore({
          sessionTtlHours: config.SESSION_TTL_HOURS,
          modeSwitchTtlMinutes: config.MODE_SWITCH_TTL_MINUTES,
          appUrl: config.APP_URL,
          aiKeys: {
            OPENAI_API_KEY: config.OPENAI_API_KEY,
            ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
            OPENROUTER_API_KEY: config.OPENROUTER_API_KEY
          }
        })
      : new PrismaStore(prisma!, {
          modeSwitchTtlMinutes: config.MODE_SWITCH_TTL_MINUTES,
          appUrl: config.APP_URL,
          encryptionSecret: config.COOKIE_SECRET,
          aiKeys: {
            OPENAI_API_KEY: config.OPENAI_API_KEY,
            ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
            OPENROUTER_API_KEY: config.OPENROUTER_API_KEY
          }
        }));

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
    uptime: process.uptime(),
    ...(await resolveAiCapabilities(store))
  }));

  await registerRuntimeRoutes(app);
  await registerMediaRoutes(app);
  await registerAuthRoutes(app, { store, config });
  await registerFeedRoutes(app, { store, queues });
  await registerItemRoutes(app, { store });
  await registerMeRoutes(app, { store, queues });
  await app.register(async (instance) => registerAdminRoutes(instance, { store, queues }), { prefix: '' });

  app.addHook('onClose', async () => {
    await Promise.allSettled([store.disconnect?.(), queues.close(), prisma?.$disconnect?.()]);
  });

  return app;
}

async function resolveAiCapabilities(store: AppStore) {
  const [aiConfig, aiKeys] = await Promise.all([store.getAiConfig(), store.getAiRuntimeKeys()]);
  const provider = aiConfig.provider;
  return {
    aiAvailable: hasProviderKey(provider, aiKeys),
    aiProvider: provider
  };
}
