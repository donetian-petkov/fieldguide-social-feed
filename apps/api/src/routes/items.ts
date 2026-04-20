import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { InterfaceLanguage } from '@edu-feed/shared';

import type { AppStore } from '../lib/store';

const commentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

const askAiBodySchema = z.object({
  question: z.string().trim().min(3).max(600),
  language: z.enum(['en', 'bg']).default('en')
});

const albumBodySchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).default('')
});

const albumItemBodySchema = z.object({
  itemId: z.string().trim().min(1)
});

const submissionBodySchema = z.object({
  type: z.enum(['link', 'community_post']),
  title: z.string().trim().min(2).max(160),
  sourceUrl: z.string().url().nullable().optional(),
  body: z.string().trim().nullable().optional()
});

export async function registerItemRoutes(app: FastifyInstance, options: { store: AppStore }) {
  app.get('/v1/items/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const item = await options.store.getItem(params.id, request.currentUser?.username);
    if (!item) {
      reply.code(404);
      return { error: 'Item not found.' };
    }
    return {
      item,
      comments: await options.store.listComments(item.id)
    };
  });

  app.post('/v1/items/:id/save', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const params = request.params as { id: string };
    return options.store.saveItem(request.currentUser.username, params.id);
  });

  app.delete('/v1/items/:id/save', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const params = request.params as { id: string };
    return options.store.unsaveItem(request.currentUser.username, params.id);
  });

  app.post('/v1/items/:id/hide', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const params = request.params as { id: string };
    return options.store.hideItem(request.currentUser.username, params.id);
  });

  app.post('/v1/items/:id/comments', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const params = request.params as { id: string };
    const parsed = commentBodySchema.parse(request.body || {});
    return {
      comment: await options.store.addComment(request.currentUser.username, params.id, parsed.body)
    };
  });

  app.post('/v1/items/:id/share', async (request) => {
    const params = request.params as { id: string };
    return options.store.shareItem(params.id);
  });

  app.post('/v1/items/:id/ask-ai', async (request) => {
    const params = request.params as { id: string };
    const parsed = askAiBodySchema.parse(request.body || {});
    return options.store.askAi(params.id, parsed.question, parsed.language as InterfaceLanguage);
  });

  app.get('/v1/albums', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    return {
      albums: await options.store.getAlbums(request.currentUser.username)
    };
  });

  app.post('/v1/albums', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const parsed = albumBodySchema.parse(request.body || {});
    return {
      album: await options.store.createAlbum(request.currentUser.username, parsed.title, parsed.description)
    };
  });

  app.post('/v1/albums/:id/items', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const params = request.params as { id: string };
    const parsed = albumItemBodySchema.parse(request.body || {});
    return {
      album: await options.store.addAlbumItem(request.currentUser.username, params.id, parsed.itemId)
    };
  });

  app.post('/v1/submissions', async (request) => {
    if (!request.currentUser) throw new Error('Authentication is required.');
    const parsed = submissionBodySchema.parse(request.body || {});
    return {
      submission: await options.store.createSubmission(request.currentUser.username, parsed)
    };
  });
}
