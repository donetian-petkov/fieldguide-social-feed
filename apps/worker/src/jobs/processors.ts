import { DEMO_ITEMS, DEMO_SOURCES, resolveTranslation } from '@edu-feed/shared';

import type { AiEnrichmentJobPayload, IngestionJobPayload, NewsletterJobPayload } from './types';

export async function processIngestionJob(payload: IngestionJobPayload) {
  const source = DEMO_SOURCES.find((entry) => entry.id === payload.sourceId || entry.feedUrl === payload.feedUrl);
  return {
    ok: true,
    sourceName: source?.name || 'Unknown source',
    discoveredItems: DEMO_ITEMS.filter((item) => item.sourceId === source?.id).length,
    polledAt: new Date().toISOString()
  };
}

export async function processAiEnrichmentJob(payload: AiEnrichmentJobPayload) {
  const item = DEMO_ITEMS.find((entry) => entry.id === payload.itemId);
  return {
    ok: true,
    itemId: payload.itemId,
    title: item ? resolveTranslation(item, 'en')?.title : 'Unknown item',
    completedTasks: payload.tasks
  };
}

export async function processNewsletterJob(payload: NewsletterJobPayload) {
  const articles = DEMO_ITEMS.filter((item) => item.audience !== 'adult_only').slice(0, 3);
  return {
    ok: true,
    username: payload.username,
    cadence: payload.mode,
    subjectLine: payload.mode === 'daily' ? 'Your Fieldguide daily digest' : 'Your Fieldguide weekly digest',
    articleTitles: articles.map((item) => resolveTranslation(item, 'en')?.title || item.originalTitle)
  };
}
