import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { aiModelConfigSchema, sourceDefinitionSchema, subjectTagSchema, userRoleSchema } from '@edu-feed/shared';

import type { AppQueues } from '../lib/queues.js';
import type { AppStore } from '../lib/store.js';

const itemPatchSchema = z.object({
  audience: z.enum(['kid_safe', 'standard_only', 'adult_only']).optional(),
  commentsLocked: z.boolean().optional(),
  flags: z.array(z.enum(['nsfw', 'spoiler', 'not_verified', 'gore', 'sensitive_history'])).optional(),
  hiddenByDefault: z.boolean().optional(),
  pinned: z.boolean().optional()
});

const pinBodySchema = z.object({
  slot: z.number().int().nonnegative().default(0)
});

const lockBodySchema = z.object({
  locked: z.boolean().default(true)
});

const suspendBodySchema = z.object({
  suspended: z.boolean().default(true)
});

const userRoleBodySchema = z.object({
  role: userRoleSchema
});

const submissionReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected'])
});

const deleteCommentSchema = z.object({
  moderationNote: z.string().trim().max(500).optional()
});

const removeItemSchema = z.object({
  removed: z.boolean().default(true)
});

const generatedStoryRequestSchema = z.object({
  subject: subjectTagSchema.exclude(['community']),
  prompt: z.string().trim().min(12).max(1200)
});

const generatedStoryReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected'])
});

export async function registerAdminRoutes(app: FastifyInstance, options: { store: AppStore; queues: AppQueues }) {
  app.addHook('preHandler', async (request) => {
    if (!request.currentUser || request.currentUser.role !== 'admin') {
      throw new Error('Admin access is required.');
    }
  });

  app.get('/v1/admin/dashboard', async () => {
    return options.store.getAdminSnapshot();
  });

  app.get('/v1/admin/usage-summary', async () => {
    return {
      summary: await options.store.getAdminAiUsageSummary()
    };
  });

  app.get('/v1/admin/sources', async () => {
    return {
      sources: await options.store.listSources()
    };
  });

  app.post('/v1/admin/sources', async (request) => {
    const parsed = sourceDefinitionSchema.omit({ id: true }).parse(request.body || {});
    const source = await options.store.addSource(parsed);
    await options.queues.scheduleSource(source.id, source.feedUrl).catch((error) => {
      app.log.warn({ error, sourceId: source.id }, 'Failed to register source polling job');
    });
    return { source };
  });

  app.patch('/v1/admin/sources/:id', async (request) => {
    const params = request.params as { id: string };
    const parsed = sourceDefinitionSchema.omit({ id: true }).partial().parse(request.body || {});
    return {
      source: await options.store.updateSource(params.id, parsed)
    };
  });

  app.delete('/v1/admin/sources/:id', async (request) => {
    const params = request.params as { id: string };
    await options.store.deleteSource(params.id);
    await options.queues.removeSourceSchedule(params.id).catch((error) => {
      app.log.warn({ error, sourceId: params.id }, 'Failed to remove source polling job');
    });
    return {
      ok: true
    };
  });

  app.post('/v1/admin/sources/:id/resync', async (request, reply) => {
    const params = request.params as { id: string };
    const sources = await options.store.listSources();
    const source = sources.find((entry) => entry.id === params.id);
    if (!source) {
      reply.code(404);
      return { error: 'Source not found.' };
    }
    await options.queues.runSourceResync(source.id, source.feedUrl).catch((error) => {
      app.log.warn({ error, sourceId: source.id }, 'Failed to enqueue source resync');
    });
    return {
      ok: true
    };
  });

  app.patch('/v1/admin/items/:id', async (request) => {
    const params = request.params as { id: string };
    const parsed = itemPatchSchema.parse(request.body || {});
    return {
      item: await options.store.patchItem(params.id, parsed)
    };
  });

  app.post('/v1/admin/items/:id/remove', async (request) => {
    const params = request.params as { id: string };
    const parsed = removeItemSchema.parse(request.body || {});
    return {
      item: await options.store.removeItem(params.id, parsed.removed)
    };
  });

  app.post('/v1/admin/items/:id/pin', async (request) => {
    const params = request.params as { id: string };
    const parsed = pinBodySchema.parse(request.body || {});
    return {
      item: await options.store.pinItem(params.id, parsed.slot)
    };
  });

  app.post('/v1/admin/items/:id/lock-comments', async (request) => {
    const params = request.params as { id: string };
    const parsed = lockBodySchema.parse(request.body || {});
    return {
      item: await options.store.lockComments(params.id, parsed.locked)
    };
  });

  app.post('/v1/admin/users/:id/suspend', async (request) => {
    const params = request.params as { id: string };
    const parsed = suspendBodySchema.parse(request.body || {});
    return {
      user: await options.store.suspendUser(params.id, parsed.suspended)
    };
  });

  app.post('/v1/admin/users/:id/role', async (request) => {
    const params = request.params as { id: string };
    const parsed = userRoleBodySchema.parse(request.body || {});
    return {
      user: await options.store.setUserRole(params.id, parsed.role)
    };
  });

  app.post('/v1/admin/submissions/:id/review', async (request) => {
    const params = request.params as { id: string };
    const parsed = submissionReviewSchema.parse(request.body || {});
    return await options.store.reviewSubmission(params.id, parsed.decision);
  });

  app.post('/v1/admin/comments/:id/delete', async (request) => {
    const params = request.params as { id: string };
    const parsed = deleteCommentSchema.parse(request.body || {});
    return {
      comment: await options.store.deleteComment(params.id, parsed.moderationNote)
    };
  });

  app.put('/v1/admin/ai/config', async (request) => {
    const parsed = aiModelConfigSchema.partial().parse(request.body || {});
    return {
      config: await options.store.updateAiConfig(parsed)
    };
  });

  app.get('/v1/admin/generated-stories', async () => {
    return {
      drafts: await options.store.listGeneratedStoryDrafts()
    };
  });

  app.post('/v1/admin/generated-stories', async (request) => {
    const parsed = generatedStoryRequestSchema.parse(request.body || {});
    const currentUser = request.currentUser;
    if (!currentUser) throw new Error('Admin access is required.');
    const draft = await options.store.requestGeneratedStory(currentUser.username, parsed);
    await options.queues.generateStoryDraft(draft.id).catch((error) => {
      app.log.warn({ error, draftId: draft.id }, 'Failed to enqueue generated story draft');
    });
    return {
      draft
    };
  });

  app.post('/v1/admin/generated-stories/:id/review', async (request) => {
    const params = request.params as { id: string };
    const parsed = generatedStoryReviewSchema.parse(request.body || {});
    const currentUser = request.currentUser;
    if (!currentUser) throw new Error('Admin access is required.');
    return options.store.reviewGeneratedStory(currentUser.username, params.id, parsed.decision);
  });
}
