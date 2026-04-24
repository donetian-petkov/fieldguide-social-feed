import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const mediaQuerySchema = z.object({
  url: z.string().url()
});

const MEDIA_TTL_MS = 6 * 60 * 60 * 1000;
const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

type CachedMedia = {
  body: Buffer;
  contentType: string;
  etag: string;
  expiresAt: number;
};

const mediaCache = new Map<string, CachedMedia>();
const mediaInflight = new Map<string, Promise<CachedMedia>>();

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get('/v1/media', async (request, reply) => {
    const parsed = mediaQuerySchema.parse(request.query || {});
    const target = new URL(parsed.url);

    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new Error('Only http and https image URLs are supported.');
    }

    try {
      const asset = await loadRemoteImage(target.toString());
      reply
        .header('content-type', asset.contentType)
        .header('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
        .header('etag', asset.etag)
        .send(asset.body);
      return reply;
    } catch (error) {
      request.log.warn({ error, url: target.toString() }, 'Image relay failed');
      reply.code(502);
      return {
        error: 'Image relay failed.'
      };
    }
  });
}

async function loadRemoteImage(url: string) {
  const cached = mediaCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const inflight = mediaInflight.get(url);
  if (inflight) {
    return inflight;
  }

  const request = fetchRemoteImage(url).finally(() => {
    mediaInflight.delete(url);
  });
  mediaInflight.set(url, request);
  return request;
}

async function fetchRemoteImage(url: string): Promise<CachedMedia> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
    headers: {
      'user-agent': 'FieldguideMediaRelay/0.1 (+http://localhost:4000)'
    }
  });

  if (!response.ok) {
    throw new Error(`Image request failed with status ${response.status}.`);
  }

  const rawContentType = response.headers.get('content-type') || '';
  const contentType = rawContentType.split(';')[0]?.trim().toLowerCase() || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Unsupported media type: ${contentType || 'unknown'}.`);
  }

  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (declaredLength > MEDIA_MAX_BYTES) {
    throw new Error('Remote image exceeds the size limit.');
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MEDIA_MAX_BYTES) {
    throw new Error('Remote image exceeds the size limit.');
  }

  const asset: CachedMedia = {
    body,
    contentType,
    etag: `"${createHash('sha1').update(url).update(body).digest('hex')}"`,
    expiresAt: Date.now() + MEDIA_TTL_MS
  };

  mediaCache.set(url, asset);
  return asset;
}
