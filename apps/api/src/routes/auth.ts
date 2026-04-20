import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import type { AppStore } from '../lib/store.js';

const registerBodySchema = z.object({
  username: z.string().trim().min(3).max(24),
  displayName: z.string().trim().min(2).max(64),
  password: z.string().min(8)
});

const loginBodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(8)
});

const forgotPasswordBodySchema = z.object({
  identifier: z.string().trim().min(1)
});

const resetPasswordBodySchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8)
});

const verifyPasswordBodySchema = z.object({
  password: z.string().min(8)
});

export async function registerAuthRoutes(app: FastifyInstance, options: { store: AppStore; config: AppConfig }) {
  app.post('/v1/auth/register', async (request, reply) => {
    const parsed = registerBodySchema.parse(request.body || {});
    const result = await options.store.register(parsed);
    reply.setCookie('fieldguide_session', result.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      signed: false
    });
    return {
      user: result.user
    };
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const parsed = loginBodySchema.parse(request.body || {});
    const result = await options.store.login(parsed.username, parsed.password);
    reply.setCookie('fieldguide_session', result.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      signed: false
    });
    return {
      user: result.user
    };
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    await options.store.logout(request.cookies.fieldguide_session);
    reply.clearCookie('fieldguide_session', {
      path: '/'
    });
    return {
      ok: true
    };
  });

  app.post('/v1/auth/forgot-password', async (request) => {
    const parsed = forgotPasswordBodySchema.parse(request.body || {});
    return options.store.forgotPassword(parsed.identifier);
  });

  app.post('/v1/auth/reset-password', async (request) => {
    const parsed = resetPasswordBodySchema.parse(request.body || {});
    return options.store.resetPassword(parsed.token, parsed.password);
  });

  app.post('/v1/auth/verify-password', async (request) => {
    const parsed = verifyPasswordBodySchema.parse(request.body || {});
    if (!request.currentUser) {
      return replyUnauthorized();
    }
    const verifiedUntil = await options.store.verifyPassword(request.currentUser.username, parsed.password);
    return {
      ok: true,
      verifiedUntil
    };
  });
}

function replyUnauthorized() {
  throw new Error('Authentication is required.');
}
