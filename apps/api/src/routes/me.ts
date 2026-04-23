import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { contentModeSchema } from '@edu-feed/shared';

import type { AppQueues } from '../lib/queues.js';
import type { AppStore } from '../lib/store.js';

const settingsPatchSchema = z.object({
  language: z.enum(['en', 'bg']).optional(),
  contentLanguageMode: z.enum(['single', 'dual']).optional(),
  vibePreset: z.enum(['museum', 'archive', 'field_notes', 'cinema', 'naturalist']).optional(),
  fontFamily: z.string().trim().optional(),
  fontScale: z.enum(['sm', 'md', 'lg']).optional(),
  imageMode: z.enum(['on', 'off']).optional(),
  themeMode: z.enum(['light', 'dark', 'system']).optional(),
  newsletterEnabled: z.boolean().optional(),
  newsletterCadence: z.enum(['daily', 'weekly']).optional(),
  askAiEnabled: z.boolean().optional()
});

const modeSwitchSchema = z.object({
  nextMode: contentModeSchema,
  password: z.string().min(8).optional()
});

export async function registerMeRoutes(app: FastifyInstance, options: { store: AppStore; queues: AppQueues }) {
  app.get('/v1/me', async (request, reply) => {
    if (!request.currentUser) {
      reply.code(401);
      return { user: null };
    }
    return {
      user: request.currentUser,
      albums: await options.store.getAlbums(request.currentUser.username)
    };
  });

  app.patch('/v1/me/settings', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const parsed = settingsPatchSchema.parse(request.body || {});
    const user = await options.store.updateUserSettings(request.currentUser.username, parsed);
    if (parsed.newsletterEnabled !== undefined || parsed.newsletterCadence !== undefined) {
      await options.queues.syncNewsletterSchedule(user.username, user.newsletterEnabled, user.newsletterCadence).catch((error) => {
        app.log.warn({ error, username: user.username }, 'Failed to sync newsletter schedule');
      });
    }
    return { user };
  });

  app.post('/v1/account/content-mode/switch', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const parsed = modeSwitchSchema.parse(request.body || {});
    return options.store.switchContentMode(request.currentUser.username, parsed.nextMode, parsed.password);
  });

  app.get('/v1/profile/:username', async (request, reply) => {
    const params = request.params as { username: string };
    const profileItems = await options.store.getProfileItems(params.username);
    if (!profileItems.length) {
      reply.code(404);
      return { error: 'Profile not found.' };
    }
    return {
      username: params.username,
      items: profileItems
    };
  });
}
