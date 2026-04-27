import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

async function recordRuntimeActivity() {
  const activityFile = process.env.STACK_ACTIVITY_FILE?.trim();
  if (!activityFile) {
    return false;
  }

  await mkdir(path.dirname(activityFile), { recursive: true });
  await writeFile(
    activityFile,
    JSON.stringify({ updatedAt: new Date().toISOString() }),
    'utf8'
  );
  return true;
}

export async function registerRuntimeRoutes(app: FastifyInstance) {
  app.post('/v1/runtime/activity', async (_request, reply) => {
    await recordRuntimeActivity().catch((error) => {
      app.log.warn({ err: error }, 'Failed to record runtime activity');
    });
    reply.code(204);
    return null;
  });
}
