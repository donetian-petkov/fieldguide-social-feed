import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { contentModeSchema } from '@edu-feed/shared';

import { DemoStore } from '../lib/demo-store';

const settingsPatchSchema = z.object({
  language: z.enum(['en', 'bg']).optional(),
  contentLanguageMode: z.enum(['single', 'dual']).optional(),
  vibePreset: z.enum(['museum', 'archive', 'field_notes', 'cinema', 'naturalist']).optional(),
  fontFamily: z.string().trim().optional(),
  fontScale: z.enum(['sm', 'md', 'lg']).optional(),
  imageMode: z.enum(['on', 'off']).optional(),
  themeMode: z.enum(['light', 'dark', 'system']).optional(),
  newsletterEnabled: z.boolean().optional(),
  askAiEnabled: z.boolean().optional()
});

const modeSwitchSchema = z.object({
  nextMode: contentModeSchema,
  password: z.string().min(8).optional()
});

export async function registerMeRoutes(app: FastifyInstance, options: { store: DemoStore }) {
  app.get('/v1/me', async (request, reply) => {
    if (!request.currentUser) {
      reply.code(401);
      return { user: null };
    }
    return {
      user: request.currentUser,
      albums: options.store.getAlbums(request.currentUser.username)
    };
  });

  app.patch('/v1/me/settings', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const parsed = settingsPatchSchema.parse(request.body || {});
    return {
      user: options.store.updateUserSettings(request.currentUser.username, parsed)
    };
  });

  app.post('/v1/account/content-mode/switch', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const parsed = modeSwitchSchema.parse(request.body || {});
    return options.store.switchContentMode(request.currentUser.username, parsed.nextMode, parsed.password);
  });

  app.get('/v1/profile/:username', async (request, reply) => {
    const params = request.params as { username: string };
    const profileItems = options.store.getProfileItems(params.username);
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
