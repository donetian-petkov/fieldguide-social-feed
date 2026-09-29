import { createHash } from 'node:crypto';

import { safeFetch } from '@edu-feed/shared/dist/safe-fetch.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const mediaQuerySchema = z.object({
  url: z.string().url()
});

const MEDIA_TTL_MS = 6 * 60 * 60 * 1000;
const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
// Cap the in-memory cache so a flood of distinct image URLs cannot exhaust the API's memory.
const MEDIA_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const MEDIA_CACHE_MAX_ENTRIES = 500;

type CachedMedia = {
  body: Buffer;
  contentType: string;
  etag: string;
  expiresAt: number;
};

const mediaCache = new Map<string, CachedMedia>();
const mediaInflight = new Map<string, Promise<CachedMedia>>();
let mediaCacheBytes = 0;

function cacheDelete(url: string) {
  const existing = mediaCache.get(url);
  if (!existing) return;
  mediaCacheBytes -= existing.body.byteLength;
  mediaCache.delete(url);
}

function cacheSet(url: string, asset: CachedMedia) {
  cacheDelete(url);
  mediaCache.set(url, asset);
  mediaCacheBytes += asset.body.byteLength;
  // Map iteration order is insertion order, so the first key is the least recently used.
  while (mediaCacheBytes > MEDIA_CACHE_MAX_BYTES || mediaCache.size > MEDIA_CACHE_MAX_ENTRIES) {
    const oldest = mediaCache.keys().next().value;
    if (oldest === undefined) break;
    cacheDelete(oldest);
  }
}

export type MediaFetch = (url: string, init: { timeoutMs: number; maxBytes: number; headers: Record<string, string> }) => Promise<Response>;

export async function registerMediaRoutes(app: FastifyInstance, options: { fetchImage?: MediaFetch } = {}) {
  const fetchImage = options.fetchImage || safeFetch;
  app.get('/v1/media', async (request, reply) => {
    const parsed = mediaQuerySchema.parse(request.query || {});
    const target = new URL(parsed.url);

    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new Error('Only http and https image URLs are supported.');
    }

    try {
      const asset = await loadRemoteImage(target.toString(), fetchImage);
      reply
        .header('content-type', asset.contentType)
        .header('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
        .header('etag', asset.etag)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
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

async function loadRemoteImage(url: string, fetchImage: MediaFetch) {
  const cached = mediaCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    cacheSet(url, cached);
    return cached;
  }
  if (cached) cacheDelete(url);

  const inflight = mediaInflight.get(url);
  if (inflight) {
    return inflight;
  }

  const request = fetchRemoteImage(url, fetchImage).finally(() => {
    mediaInflight.delete(url);
  });
  mediaInflight.set(url, request);
  return request;
}

async function fetchRemoteImage(url: string, fetchImage: MediaFetch): Promise<CachedMedia> {
  // safeFetch refuses internal addresses and stops reading once the size limit is passed.
  const response = await fetchImage(url, {
    timeoutMs: 12_000,
    maxBytes: MEDIA_MAX_BYTES,
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

  const body = Buffer.from(await response.arrayBuffer());
  const asset: CachedMedia = {
    body,
    contentType,
    etag: `"${createHash('sha1').update(url).update(body).digest('hex')}"`,
    expiresAt: Date.now() + MEDIA_TTL_MS
  };

  cacheSet(url, asset);
  return asset;
}
