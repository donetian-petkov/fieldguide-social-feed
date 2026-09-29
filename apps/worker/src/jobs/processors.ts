import { createHash, randomUUID } from 'node:crypto';

import type { Queue } from 'bullmq';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { AudienceLabel, GeneratedStoryCitation, GeneratedStoryVerification, InterfaceLanguage, ModerationFlag, SubjectTag } from '@edu-feed/shared';
import {
  DEFAULT_SOURCE_REGISTRY,
  DEMO_AI_CONFIG,
  audienceLabelSchema,
  estimateCostUsd,
  estimateTokens,
  fallbackModelForProvider,
  hasProviderKey,
  interfaceLanguageSchema,
  moderationFlagSchema,
  parseJsonCompletion,
  runCompletion,
  subjectTagSchema
} from '@edu-feed/shared';
import { safeFetch } from '@edu-feed/shared/dist/safe-fetch.js';
import Parser from 'rss-parser';
import { Resend } from 'resend';
import { z } from 'zod';

import { getWorkerConfig } from '../config.js';
import { decryptAiSecret } from './ai-secrets.js';
import type { AiEnrichmentJobPayload, GeneratedStoryJobPayload, IngestionJobPayload, NewsletterJobPayload } from './types.js';
import { toJobId } from './job-ids.js';
import { buildPreferenceWeights, mergeSelectedCandidates, rankNewsletterCandidates } from './newsletter-ranking.js';

const config = getWorkerConfig();
const prisma = new PrismaClient();
const parser = new Parser();
const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

type SchedulerQueues = {
  ingestion: Queue<IngestionJobPayload>;
  aiEnrichment?: Queue<AiEnrichmentJobPayload>;
  newsletter: Queue<NewsletterJobPayload>;
  runStartupIngestion?: boolean;
};

type SourceFeedRecord = Prisma.SourceFeedGetPayload<{
  include: {
    source: true;
  };
}>;

type NewsletterUserRecord = Prisma.UserGetPayload<{
  include: {
    settings: true;
  };
}>;

type NewsletterItemRecord = Prisma.ContentItemGetPayload<{
  include: {
    source: true;
    translations: true;
    tags: true;
  };
}>;

type GeneratedStorySourceItem = Prisma.ContentItemGetPayload<{
  include: {
    source: true;
    translations: true;
    tags: true;
  };
}>;

type ParsedFeedItem = {
  title?: string;
  link?: string;
  guid?: string;
  id?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  enclosure?: {
    url?: string;
  };
  [key: string]: unknown;
};

type FeedKindLike = 'rss' | 'youtube' | 'custom';

type HtmlAdapterConfig = {
  maxItems: number;
  allowUrl: (url: URL) => boolean;
};

type IngestedItem = {
  dedupeKey: string;
  slug: string;
  kind: 'external_article' | 'youtube_video';
  publishedAt: Date;
  originalTitle: string;
  originalSummary: string;
  bodyMarkdown: string | null;
  coverImageUrl: string;
  externalUrl: string | null;
  youtubeVideoId: string | null;
  subject: SubjectTag;
  audience: AudienceLabel;
  translations: Array<{
    language: InterfaceLanguage;
    title: string;
    summary: string;
    slug: string;
    aiAudit?: AiArtifactAudit | null;
  }>;
  tags: Array<{
    label: string;
    type: 'subject' | 'audience' | 'flag' | 'meta';
    value: string;
  }>;
  promptText: string;
};

type EnrichmentResult = {
  originalSummary: string;
  translations: IngestedItem['translations'];
  subject: SubjectTag;
  audience: AudienceLabel;
  tags: IngestedItem['tags'];
  usedAi: boolean;
  summaryAudit: AiArtifactAudit | null;
  translationAudit: AiArtifactAudit | null;
  classificationAudit: AiArtifactAudit | null;
};

type AiBudgetState = {
  remainingJobBudgetUsd: number;
  remainingMonthlyBudgetUsd: number | null;
};

type EffectiveAiConfig = Awaited<ReturnType<typeof getAiConfig>>;

type AiArtifactAudit = {
  provider: EffectiveAiConfig['provider'];
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  createdAt: Date;
};

const SUBJECT_KEYWORDS: Record<SubjectTag, RegExp[]> = {
  history: [/\b(history|archive|ancient|medieval|war|empire|archaeolog)/i],
  art: [/\b(art|artist|painting|museum|sculpture|gallery|design)\b/i],
  books: [/\b(book|novel|literature|author|reading|poetry|publishing)\b/i],
  movies: [/\b(movie|film|cinema|director|screenplay|streaming|documentary)\b/i],
  country_knowledge: [/\b(country|culture|geography|nation|travel|border|capital|region)\b/i],
  photography: [/\b(photo|photography|camera|lens|exposure|portrait|landscape)\b/i],
  nature: [/\b(nature|wildlife|forest|ocean|climate|bird|animal|planet)\b/i],
  video: [/\b(video|youtube|watch|episode|channel)\b/i],
  community: [/\b(community|submission|opinion|essay)\b/i]
};

const FLAG_KEYWORDS: Array<{ flag: ModerationFlag; pattern: RegExp }> = [
  { flag: 'nsfw', pattern: /\b(sex|sexual|erotic|intimacy|porn|adult)\b/i },
  { flag: 'spoiler', pattern: /\b(spoiler|ending explained|plot twist)\b/i },
  { flag: 'gore', pattern: /\b(gore|graphic|blood|dismember|corpse)\b/i },
  { flag: 'sensitive_history', pattern: /\b(genocide|atrocity|massacre|holocaust|colonial violence)\b/i }
];

const translationOutputSchema = z.object({
  language: interfaceLanguageSchema,
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(600)
});

const classificationOutputSchema = z.object({
  subject: subjectTagSchema,
  flags: z.array(moderationFlagSchema).max(5)
});

const newsletterOutputSchema = z.object({
  intro: z.string().trim().min(1).max(500),
  highlights: z.array(z.string().trim().min(1).max(240)).min(1).max(5)
});

const newsletterSelectionSchema = z.object({
  selectedIds: z.array(z.string().trim().min(1)).min(1).max(5)
});

const generatedStoryOutputSchema = z.object({
  title: z.string().trim().min(8).max(180),
  summary: z.string().trim().min(40).max(520),
  bodyMarkdown: z.string().trim().min(240).max(6000),
  citedUrls: z.array(z.string().url()).min(1).max(8)
});

const generatedStoryVerificationSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  notes: z.string().trim().min(1).max(1000),
  unsupportedClaims: z.array(z.string().trim().min(1).max(240)).max(12)
});

const DEFAULT_SOURCE_POLL_INTERVAL_SEC = 3600;
const INGESTION_FEED_ITEM_LIMIT = Math.max(1, config.INGESTION_FEED_ITEM_LIMIT);
const INGESTION_ENRICHMENT_MAX_PER_RUN = Math.max(1, config.INGESTION_ENRICHMENT_MAX_PER_RUN);
const AI_PROMPT_BODY_CHAR_LIMIT = Math.max(400, config.AI_PROMPT_BODY_CHAR_LIMIT);

const GLOBAL_HARD_TOKEN_CAPS = {
  daily: 1_200_000,
  monthly: 18_000_000
} as const;

const PURPOSE_HARD_TOKEN_CAPS: Record<
  'summary' | 'translation' | 'classification' | 'newsletter' | 'generated_story' | 'generated_story_verification' | 'ask' | 'related',
  { daily: number; monthly: number }
> = {
  summary: { daily: 350_000, monthly: 6_000_000 },
  translation: { daily: 280_000, monthly: 5_000_000 },
  classification: { daily: 220_000, monthly: 4_000_000 },
  newsletter: { daily: 120_000, monthly: 2_000_000 },
  generated_story: { daily: 140_000, monthly: 1_500_000 },
  generated_story_verification: { daily: 90_000, monthly: 1_000_000 },
  ask: { daily: 180_000, monthly: 2_500_000 },
  related: { daily: 90_000, monthly: 1_200_000 }
};

const envAiKeys = {
  OPENAI_API_KEY: config.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
  OPENROUTER_API_KEY: config.OPENROUTER_API_KEY,
  OLLAMA_BASE_URL: config.OLLAMA_BASE_URL
};

const warnedAiStates = new Set<string>();

const HTML_ADAPTERS: Record<string, HtmlAdapterConfig> = {
  'national-geographic-history-culture': {
    maxItems: 12,
    allowUrl: (url) => /nationalgeographic\.com$/i.test(url.hostname) && /\/history\/article\//i.test(url.pathname)
  },
  'national-geographic-animals': {
    maxItems: 12,
    allowUrl: (url) => /nationalgeographic\.com$/i.test(url.hostname) && /\/animals\/article\//i.test(url.pathname)
  },
  'bta-culture': {
    maxItems: 12,
    allowUrl: (url) => /bta\.bg$/i.test(url.hostname) && /\/en\/news\/culture\//i.test(url.pathname)
  },
  'bbc-earth': {
    maxItems: 12,
    allowUrl: (url) => /bbcearth\.com$/i.test(url.hostname) && /\/news\//i.test(url.pathname)
  }
};

function sha1(value: string) {
  return createHash('sha1').update(value).digest('hex');
}

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function toTokenTotal(inputTokens?: number | null, outputTokens?: number | null) {
  return Number(inputTokens || 0) + Number(outputTokens || 0);
}

function clampPromptText(value: string, maxChars = AI_PROMPT_BODY_CHAR_LIMIT) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[content truncated]`;
}

function computeContentHash(input: { title: string; summary: string; body?: string | null; externalUrl?: string | null; sourceId: string; kind: string }) {
  const body = (input.body || '').trim();
  return sha1(
    [
      input.title.trim().toLowerCase(),
      input.summary.trim().toLowerCase(),
      clampPromptText(body, 4000).toLowerCase(),
      (input.externalUrl || '').trim().toLowerCase(),
      input.sourceId.trim().toLowerCase(),
      input.kind.trim().toLowerCase()
    ].join('|')
  );
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(value?: string | null, baseUrl?: string | URL | null) {
  if (!value) return null;
  try {
    const url = baseUrl ? new URL(value.trim(), baseUrl) : new URL(value.trim());
    url.hash = '';
    return url.toString();
  } catch {
    return value.trim() || null;
  }
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function takeParagraph(value: string, fallback: string) {
  const cleaned = stripHtml(value);
  if (!cleaned) {
    return fallback;
  }
  if (cleaned.length <= 280) {
    return cleaned;
  }
  const sliced = cleaned.slice(0, 277);
  const boundary = sliced.lastIndexOf(' ');
  return `${sliced.slice(0, boundary > 120 ? boundary : sliced.length).trim()}.`;
}

function parseSourceSubjects(source: { subjectsJson: string }): SubjectTag[] {
  try {
    const parsed = JSON.parse(source.subjectsJson) as SubjectTag[];
    return parsed.length ? parsed : ['history'];
  } catch {
    return ['history'];
  }
}

function extractMediaUrl(value: unknown, baseUrl?: string | URL | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return normalizeUrl(value, baseUrl);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractMediaUrl(entry, baseUrl);
      if (nested) return nested;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.url === 'string') return normalizeUrl(record.url, baseUrl);
    if (typeof record.href === 'string') return normalizeUrl(record.href, baseUrl);
    if (record.$ && typeof record.$ === 'object') {
      const nested = record.$ as Record<string, unknown>;
      if (typeof nested.url === 'string') return normalizeUrl(nested.url, baseUrl);
      if (typeof nested.href === 'string') return normalizeUrl(nested.href, baseUrl);
    }
  }
  return null;
}

function extractEntryImageUrl(entry: ParsedFeedItem, baseUrl?: string | URL | null) {
  const mediaGroup = entry['media:group'] as Record<string, unknown> | undefined;
  return (
    extractMediaUrl(entry.enclosure, baseUrl) ||
    extractMediaUrl(entry['media:thumbnail'], baseUrl) ||
    extractMediaUrl(entry['media:content'], baseUrl) ||
    extractMediaUrl(mediaGroup?.['media:thumbnail'], baseUrl) ||
    extractMediaUrl(mediaGroup?.['media:content'], baseUrl) ||
    extractMediaUrl(entry.image, baseUrl) ||
    null
  );
}

function extractYoutubeVideoId(value?: string | null) {
  if (!value) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/i,
    /youtu\.be\/([^?&/]+)/i,
    /yt:video:([^:]+)$/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function extractHtmlAttribute(fragment: string, attribute: string) {
  const match =
    fragment.match(new RegExp(`${attribute}\\s*=\\s*"([^"]+)"`, 'i')) ||
    fragment.match(new RegExp(`${attribute}\\s*=\\s*'([^']+)'`, 'i'));
  return match?.[1] || null;
}

function extractMetaContent(html: string, keys: string[]) {
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedKey}["'][^>]*>`, 'i')
    ];
    const match = patterns.map((pattern) => html.match(pattern)).find(Boolean);
    if (match?.[1]) {
      return decodeHtmlEntities(stripHtml(match[1])).trim();
    }
  }
  return null;
}

function extractCanonicalUrl(html: string, fallbackUrl: string) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  return normalizeUrl(match?.[1] || fallbackUrl, fallbackUrl);
}

function extractPublishedDateFromHtml(html: string) {
  const metaDate =
    extractMetaContent(html, ['article:published_time', 'og:published_time']) ||
    extractHtmlAttribute(html.match(/<time[^>]+datetime=["'][^"']+["'][^>]*>/i)?.[0] || '', 'datetime');
  if (!metaDate) return null;
  const parsed = new Date(metaDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractPreviewParagraph(html: string) {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => decodeHtmlEntities(stripHtml(match[1] || '')).replace(/\s+/g, ' ').trim())
    .filter((entry) => entry.length > 40);
  return paragraphs.slice(0, 3).join(' ').trim() || null;
}

function collectAdapterCandidates(html: string, feed: SourceFeedRecord, adapter: HtmlAdapterConfig) {
  const baseUrl = new URL(feed.feedUrl);
  const candidates: ParsedFeedItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1] || '';
    const rawHref = extractHtmlAttribute(attributes, 'href');
    if (!rawHref) continue;
    let resolved: URL;
    try {
      resolved = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }
    if (!adapter.allowUrl(resolved)) continue;
    const normalized = normalizeUrl(resolved.toString());
    if (!normalized || seen.has(normalized)) continue;
    const title = decodeHtmlEntities(stripHtml(match[2] || '')).replace(/\s+/g, ' ').trim();
    if (title.length < 24) continue;
    seen.add(normalized);
    candidates.push({
      id: normalized,
      guid: normalized,
      link: normalized,
      title
    });
    if (candidates.length >= adapter.maxItems) {
      break;
    }
  }

  return candidates;
}

async function enrichAdapterCandidate(entry: ParsedFeedItem) {
  if (!entry.link) return entry;
  try {
    const response = await safeFetch(entry.link, {
      headers: {
        'user-agent': 'FieldguideBot/0.1 (+https://fieldguide.local)'
      }
    });
    if (!response.ok) return entry;
    const html = await response.text();
    const canonicalUrl = extractCanonicalUrl(html, entry.link) || entry.link;
    const summary =
      extractMetaContent(html, ['og:description', 'twitter:description', 'description']) || extractPreviewParagraph(html) || entry.title || '';
    const imageUrl = extractMetaContent(html, ['og:image', 'twitter:image']);
    return {
      ...entry,
      id: canonicalUrl,
      guid: canonicalUrl,
      link: canonicalUrl,
      isoDate: extractPublishedDateFromHtml(html) || entry.isoDate,
      contentSnippet: summary,
      summary,
      content: extractPreviewParagraph(html) || summary,
      enclosure: imageUrl ? { url: normalizeUrl(imageUrl, canonicalUrl) || imageUrl } : entry.enclosure
    } satisfies ParsedFeedItem;
  } catch {
    return entry;
  }
}

async function enrichLinkedFeedCandidate(entry: ParsedFeedItem) {
  if (!entry.link || extractEntryImageUrl(entry, entry.link)) return entry;
  try {
    const response = await safeFetch(entry.link, {
      headers: {
        'user-agent': 'FieldguideBot/0.1 (+https://fieldguide.local)'
      }
    });
    if (!response.ok) return entry;
    const html = await response.text();
    const canonicalUrl = extractCanonicalUrl(html, entry.link) || entry.link;
    const summary =
      entry.contentSnippet ||
      entry.summary ||
      extractMetaContent(html, ['og:description', 'twitter:description', 'description']) ||
      extractPreviewParagraph(html) ||
      entry.title ||
      '';
    const imageUrl = extractMetaContent(html, ['og:image', 'twitter:image']);
    return {
      ...entry,
      id: canonicalUrl,
      guid: entry.guid || canonicalUrl,
      link: canonicalUrl,
      isoDate: entry.isoDate || extractPublishedDateFromHtml(html) || undefined,
      contentSnippet: entry.contentSnippet || summary,
      summary: entry.summary || summary,
      content: entry.content || extractPreviewParagraph(html) || summary,
      enclosure: imageUrl ? { url: normalizeUrl(imageUrl, canonicalUrl) || imageUrl } : entry.enclosure
    } satisfies ParsedFeedItem;
  } catch {
    return entry;
  }
}

async function enrichLinkedFeedCandidates(items: ParsedFeedItem[]) {
  const leadingItems = await Promise.all(items.slice(0, 20).map((entry) => enrichLinkedFeedCandidate(entry)));
  return [...leadingItems, ...items.slice(20)];
}

async function fetchCustomAdapterFeed(feed: SourceFeedRecord, html: string) {
  const adapter = HTML_ADAPTERS[feed.source.slug];
  if (!adapter) {
    throw new Error(`No HTML adapter is configured for source ${feed.source.slug}.`);
  }

  const candidates = collectAdapterCandidates(html, feed, adapter);
  const enriched = await Promise.all(candidates.map((candidate) => enrichAdapterCandidate(candidate)));
  return enriched.filter((entry) => entry.title && entry.link);
}

function detectFlags(text: string, sourceType: string) {
  const flags = new Set<ModerationFlag>();
  for (const rule of FLAG_KEYWORDS) {
    if (rule.pattern.test(text)) {
      flags.add(rule.flag);
    }
  }
  if (sourceType === 'community') {
    flags.add('not_verified');
  }
  return [...flags];
}

function detectSubject(sourceSubjects: SubjectTag[], text: string, kind: FeedKindLike): SubjectTag {
  if (kind === 'youtube' && sourceSubjects.includes('video')) {
    return 'video';
  }
  if (sourceSubjects.length === 1) {
    return sourceSubjects[0] || 'history';
  }
  let bestSubject: SubjectTag = sourceSubjects[0] || 'history';
  let bestScore = -1;
  for (const subject of sourceSubjects) {
    const score = SUBJECT_KEYWORDS[subject].reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestSubject = subject;
    }
  }
  return bestSubject;
}

function detectAudience(defaultAudience: AudienceLabel, flags: ModerationFlag[], sourceType: string): AudienceLabel {
  if (sourceType === 'adult_educational' || flags.includes('nsfw')) {
    return 'adult_only';
  }
  if (defaultAudience === 'kid_safe' && (flags.includes('gore') || flags.includes('spoiler'))) {
    return 'standard_only';
  }
  return defaultAudience;
}

function pickPublishedDate(item: ParsedFeedItem) {
  const candidate = item.isoDate || item.pubDate;
  const parsed = candidate ? new Date(candidate) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildTranslationRecords(
  sourceLanguage: InterfaceLanguage,
  title: string,
  summary: string,
  slugSeed: string
) {
  const sharedSlug = slugify(slugSeed) || `item-${randomUUID().slice(0, 8)}`;
  const makeRecord = (language: InterfaceLanguage) => ({
    language,
    title,
    summary,
    slug: `${sharedSlug}-${language}`,
    aiAudit: null
  });

  return sourceLanguage === 'bg'
    ? [makeRecord('bg'), makeRecord('en')]
    : [makeRecord('en'), makeRecord('bg')];
}

function buildLocalizedTranslationRecords(
  sourceLanguage: InterfaceLanguage,
  sourceTitle: string,
  sourceSummary: string,
  translated: z.infer<typeof translationOutputSchema>,
  slugSeed: string,
  translationAudit: AiArtifactAudit | null
) {
  const sharedSlug = slugify(slugSeed) || `item-${randomUUID().slice(0, 8)}`;
  const sourceRecord = {
    language: sourceLanguage,
    title: sourceTitle.trim(),
    summary: takeParagraph(sourceSummary, sourceSummary),
    slug: `${sharedSlug}-${sourceLanguage}`,
    aiAudit: null
  };
  const translatedRecord = {
    language: translated.language,
    title: translated.title.trim(),
    summary: takeParagraph(translated.summary, sourceSummary),
    slug: `${sharedSlug}-${translated.language}`,
    aiAudit: translationAudit
  };

  return sourceLanguage === 'bg'
    ? [sourceRecord, translatedRecord]
    : [sourceRecord, translatedRecord];
}

function toTranslationWriteRecords(translations: IngestedItem['translations']) {
  return translations.map((translation) => ({
    language: translation.language,
    title: translation.title,
    summary: translation.summary,
    slug: translation.slug,
    aiProvider: translation.aiAudit?.provider || null,
    aiModel: translation.aiAudit?.model || null,
    aiInputTokens: translation.aiAudit?.inputTokens || null,
    aiOutputTokens: translation.aiAudit?.outputTokens || null,
    aiTotalCostUsd: translation.aiAudit?.totalCostUsd || null,
    aiGeneratedAt: translation.aiAudit?.createdAt || null
  }));
}

function buildTagRecords(subject: SubjectTag, audience: AudienceLabel, flags: ModerationFlag[], kind: FeedKindLike) {
  return [
    {
      label: subject.replace('_', ' '),
      type: 'subject' as const,
      value: subject
    },
    {
      label: audience === 'kid_safe' ? 'Kid Safe' : audience === 'adult_only' ? 'Adult Only' : 'Standard',
      type: 'audience' as const,
      value: audience
    },
    ...flags.map((flag) => ({
      label:
        flag === 'not_verified'
          ? 'Not Verified'
          : flag === 'sensitive_history'
            ? 'Sensitive History'
            : flag.toUpperCase(),
      type: 'flag' as const,
      value: flag
    })),
    {
      label: kind === 'youtube' ? 'Video Feed' : kind.toUpperCase(),
      type: 'meta' as const,
      value: kind
    }
  ];
}

function localizedTitle(item: NewsletterItemRecord, language: InterfaceLanguage) {
  return item.translations.find((translation) => translation.language === language)?.title || item.originalTitle;
}

function localizedSummary(item: NewsletterItemRecord, language: InterfaceLanguage) {
  return item.translations.find((translation) => translation.language === language)?.summary || item.originalSummary;
}

function formatPreferenceSignal(key: string) {
  if (key.startsWith('subject:')) {
    return `subject=${key.slice('subject:'.length)}`;
  }

  if (key.startsWith('tag:')) {
    const parts = key.split(':');
    return `${parts[1] || 'tag'}=${parts.slice(2).join(':')}`;
  }

  return key;
}

function summarizePreferenceWeights(weights: Map<string, number>) {
  const entries = [...weights.entries()];
  const positive = entries
    .filter(([, weight]) => weight > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([key, weight]) => `${formatPreferenceSignal(key)} (+${weight})`);
  const negative = entries
    .filter(([, weight]) => weight < 0)
    .sort((left, right) => left[1] - right[1])
    .slice(0, 4)
    .map(([key, weight]) => `${formatPreferenceSignal(key)} (${weight})`);

  return {
    positive,
    negative
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getAiConfig() {
  const stored = await prisma.aiConfig.findUnique({
    where: {
      id: 1
    }
  });
  if (!stored) {
    return DEMO_AI_CONFIG;
  }
  return {
    provider: stored.provider as typeof DEMO_AI_CONFIG.provider,
    summaryModel: stored.summaryModel,
    translationModel: stored.translationModel,
    askModel: stored.askModel,
    newsletterModel: stored.newsletterModel,
    ollamaBaseUrl: stored.ollamaBaseUrl || '',
    monthlyBudgetUsd: Number(stored.monthlyBudgetUsd),
    perJobBudgetUsd: Number(stored.perJobBudgetUsd),
    autoDowngrade: stored.autoDowngrade,
    pauseOnBudgetExceeded: stored.pauseOnBudgetExceeded
  };
}

async function getAiRuntimeKeys() {
  const stored = await prisma.aiConfig.findUnique({
    where: {
      id: 1
    },
    select: {
      openaiApiKeyCiphertext: true,
      anthropicApiKeyCiphertext: true,
      openrouterApiKeyCiphertext: true,
      ollamaBaseUrl: true
    }
  });
  const storedKeys = {
    OPENAI_API_KEY: decryptAiSecret(stored?.openaiApiKeyCiphertext, config.COOKIE_SECRET),
    ANTHROPIC_API_KEY: decryptAiSecret(stored?.anthropicApiKeyCiphertext, config.COOKIE_SECRET),
    OPENROUTER_API_KEY: decryptAiSecret(stored?.openrouterApiKeyCiphertext, config.COOKIE_SECRET),
    OLLAMA_BASE_URL: stored?.ollamaBaseUrl || ''
  };
  return {
    OPENAI_API_KEY: storedKeys.OPENAI_API_KEY || envAiKeys.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: storedKeys.ANTHROPIC_API_KEY || envAiKeys.ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY: storedKeys.OPENROUTER_API_KEY || envAiKeys.OPENROUTER_API_KEY,
    OLLAMA_BASE_URL: storedKeys.OLLAMA_BASE_URL || envAiKeys.OLLAMA_BASE_URL
  };
}

async function recordSystemError(scope: 'worker' | 'ingestion' | 'email' | 'ai', level: 'error' | 'warn', message: string) {
  await prisma.systemErrorEvent.create({
    data: {
      scope,
      level,
      message
    }
  });
}

async function ensureDefaultSourceRegistry() {
  for (const source of DEFAULT_SOURCE_REGISTRY) {
    const existing = await prisma.source.findUnique({
      where: {
        id: source.id
      },
      include: {
        feeds: true
      }
    });
    const nextStatus = existing?.status === 'paused' ? 'paused' : source.status;

    if (!existing) {
      await prisma.source.create({
        data: {
          id: source.id,
          name: source.name,
          slug: source.slug,
          iconUrl: source.iconUrl,
          siteUrl: source.siteUrl,
          description: source.description,
          subjectsJson: JSON.stringify(source.subjects),
          language: source.language,
          defaultAudience: source.defaultAudience,
          sourceType: source.sourceType,
          status: source.status,
          feeds: {
            create: {
              kind: source.kind,
              feedUrl: source.feedUrl,
              pollIntervalSec: DEFAULT_SOURCE_POLL_INTERVAL_SEC
            }
          }
        }
      });
      continue;
    }

    await prisma.source.update({
      where: {
        id: source.id
      },
      data: {
        name: source.name,
        slug: source.slug,
        iconUrl: source.iconUrl,
        siteUrl: source.siteUrl,
        description: source.description,
        subjectsJson: JSON.stringify(source.subjects),
        language: source.language,
        defaultAudience: source.defaultAudience,
        sourceType: source.sourceType,
        status: nextStatus
      }
    });

    const primaryFeed = existing.feeds[0];
    if (primaryFeed) {
      await prisma.sourceFeed.update({
        where: {
          id: primaryFeed.id
        },
        data: {
          kind: source.kind,
          feedUrl: source.feedUrl,
          pollIntervalSec:
            primaryFeed.pollIntervalSec < DEFAULT_SOURCE_POLL_INTERVAL_SEC
              ? DEFAULT_SOURCE_POLL_INTERVAL_SEC
              : primaryFeed.pollIntervalSec
        }
      });
    } else {
      await prisma.sourceFeed.create({
        data: {
          sourceId: source.id,
          kind: source.kind,
          feedUrl: source.feedUrl,
          pollIntervalSec: DEFAULT_SOURCE_POLL_INTERVAL_SEC
        }
      });
    }
  }
}

async function recordUniqueAiWarning(key: string, message: string) {
  if (warnedAiStates.has(key)) {
    return;
  }
  warnedAiStates.add(key);
  await recordSystemError('ai', 'warn', message);
}

async function getMonthlyAiSpendUsd() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const aggregate = await prisma.aiUsageLedger.aggregate({
    _sum: {
      totalCostUsd: true
    },
    where: {
      createdAt: {
        gte: monthStart
      }
    }
  });
  return Number(aggregate._sum.totalCostUsd || 0);
}

async function getTokenUsageTotal(since: Date, purpose?: string) {
  const aggregate = await prisma.aiUsageLedger.aggregate({
    _sum: {
      inputTokens: true,
      outputTokens: true
    },
    where: {
      createdAt: {
        gte: since
      },
      ...(purpose ? { purpose } : {})
    }
  });
  return toTokenTotal(aggregate._sum.inputTokens, aggregate._sum.outputTokens);
}

async function passesHardTokenCaps(
  purpose: keyof typeof PURPOSE_HARD_TOKEN_CAPS,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
) {
  const requestedTokens = estimatedInputTokens + estimatedOutputTokens;
  const dayStart = startOfUtcDay();
  const monthStart = startOfUtcMonth();
  const [globalDailyUsed, globalMonthlyUsed, purposeDailyUsed, purposeMonthlyUsed] = await Promise.all([
    getTokenUsageTotal(dayStart),
    getTokenUsageTotal(monthStart),
    getTokenUsageTotal(dayStart, purpose),
    getTokenUsageTotal(monthStart, purpose)
  ]);

  if (globalDailyUsed + requestedTokens > GLOBAL_HARD_TOKEN_CAPS.daily) {
    return { ok: false as const, reason: `global daily token cap reached (${GLOBAL_HARD_TOKEN_CAPS.daily.toLocaleString()})` };
  }
  if (globalMonthlyUsed + requestedTokens > GLOBAL_HARD_TOKEN_CAPS.monthly) {
    return { ok: false as const, reason: `global monthly token cap reached (${GLOBAL_HARD_TOKEN_CAPS.monthly.toLocaleString()})` };
  }
  if (purposeDailyUsed + requestedTokens > PURPOSE_HARD_TOKEN_CAPS[purpose].daily) {
    return {
      ok: false as const,
      reason: `${purpose} daily token cap reached (${PURPOSE_HARD_TOKEN_CAPS[purpose].daily.toLocaleString()})`
    };
  }
  if (purposeMonthlyUsed + requestedTokens > PURPOSE_HARD_TOKEN_CAPS[purpose].monthly) {
    return {
      ok: false as const,
      reason: `${purpose} monthly token cap reached (${PURPOSE_HARD_TOKEN_CAPS[purpose].monthly.toLocaleString()})`
    };
  }
  return { ok: true as const };
}

function createAiBudgetState(aiConfig: EffectiveAiConfig, monthlySpent: number): AiBudgetState {
  return {
    remainingJobBudgetUsd: aiConfig.perJobBudgetUsd,
    remainingMonthlyBudgetUsd: aiConfig.pauseOnBudgetExceeded
      ? Math.max(0, aiConfig.monthlyBudgetUsd - monthlySpent)
      : null
  };
}

function chooseBudgetedModel(input: {
  provider: EffectiveAiConfig['provider'];
  configuredModel: string;
  inputTokens: number;
  outputTokens: number;
  autoDowngrade: boolean;
  budget: AiBudgetState;
}) {
  const fitsBudget = (cost: number) =>
    cost <= input.budget.remainingJobBudgetUsd &&
    (input.budget.remainingMonthlyBudgetUsd === null || cost <= input.budget.remainingMonthlyBudgetUsd);

  const configuredCost = estimateCostUsd(input.provider, input.configuredModel, input.inputTokens, input.outputTokens);
  if (fitsBudget(configuredCost)) {
    return {
      model: input.configuredModel,
      estimatedCostUsd: configuredCost,
      downgraded: false
    };
  }

  if (!input.autoDowngrade) {
    return null;
  }

  const fallbackModel = fallbackModelForProvider(input.provider);
  const fallbackCost = estimateCostUsd(input.provider, fallbackModel, input.inputTokens, input.outputTokens);
  if (!fitsBudget(fallbackCost)) {
    return null;
  }

  return {
    model: fallbackModel,
    estimatedCostUsd: fallbackCost,
    downgraded: fallbackModel !== input.configuredModel
  };
}

async function runBudgetedCompletion<T>(input: {
  purpose: 'summary' | 'translation' | 'classification' | 'newsletter' | 'generated_story' | 'generated_story_verification';
  provider: EffectiveAiConfig['provider'];
  configuredModel: string;
  autoDowngrade: boolean;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens: number;
  budget: AiBudgetState;
  itemId?: string;
  userId?: string;
  parser?: (text: string) => T;
}) {
  const aiKeys = await getAiRuntimeKeys();
  if (!hasProviderKey(input.provider, aiKeys)) {
    await recordUniqueAiWarning(
      `missing-key:${input.provider}`,
      `AI fallback active: missing configuration for provider ${input.provider}.`
    );
    return null;
  }

  const estimatedInputTokens = estimateTokens(`${input.systemPrompt}\n${input.userPrompt}`);
  const hardCapCheck = await passesHardTokenCaps(input.purpose, estimatedInputTokens, input.maxOutputTokens);
  if (!hardCapCheck.ok) {
    await recordUniqueAiWarning(
      `hard-cap:${input.purpose}:${input.provider}`,
      `AI fallback active: ${input.purpose} skipped because ${hardCapCheck.reason}.`
    );
    return null;
  }
  const selection = chooseBudgetedModel({
    provider: input.provider,
    configuredModel: input.configuredModel,
    inputTokens: estimatedInputTokens,
    outputTokens: input.maxOutputTokens,
    autoDowngrade: input.autoDowngrade,
    budget: input.budget
  });

  if (!selection) {
    await recordUniqueAiWarning(
      `budget:${input.purpose}:${input.provider}:${input.configuredModel}`,
      `AI fallback active: ${input.purpose} skipped because the configured budget would be exceeded for ${input.provider}.`
    );
    return null;
  }

  if (selection.downgraded) {
    await recordUniqueAiWarning(
      `downgrade:${input.purpose}:${input.provider}:${input.configuredModel}:${selection.model}`,
      `AI budget downgrade active: ${input.purpose} moved from ${input.configuredModel} to ${selection.model}.`
    );
  }

  try {
    const createdAt = new Date();
    const completion = await runCompletion({
      provider: input.provider,
      model: selection.model,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      temperature: input.temperature ?? 0.2,
      maxOutputTokens: input.maxOutputTokens,
      keys: aiKeys
    });
    const totalCostUsd = estimateCostUsd(input.provider, selection.model, completion.inputTokens, completion.outputTokens);
    input.budget.remainingJobBudgetUsd = Math.max(0, input.budget.remainingJobBudgetUsd - totalCostUsd);
    if (input.budget.remainingMonthlyBudgetUsd !== null) {
      input.budget.remainingMonthlyBudgetUsd = Math.max(0, input.budget.remainingMonthlyBudgetUsd - totalCostUsd);
    }

    await prisma.aiUsageLedger.create({
      data: {
        itemId: input.itemId || null,
        userId: input.userId || null,
        provider: input.provider,
        model: selection.model,
        purpose: input.purpose,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        totalCostUsd
      }
    });

    return {
      output: input.parser ? input.parser(completion.text) : ((completion.text as unknown) as T),
      model: selection.model,
      totalCostUsd,
      provider: input.provider,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      createdAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown AI provider failure.';
    await recordSystemError('ai', 'warn', `${input.purpose} fallback triggered: ${message}`);
    return null;
  }
}

async function loadSourceFeed(payload: IngestionJobPayload) {
  return prisma.sourceFeed.findFirst({
    where: {
      OR: [
        {
          sourceId: payload.sourceId
        },
        {
          feedUrl: payload.feedUrl
        }
      ]
    },
    include: {
      source: true
    }
  });
}

async function fetchFeed(feed: SourceFeedRecord) {
  const response = await safeFetch(feed.feedUrl, {
    maxBytes: 15 * 1024 * 1024,
    headers: {
      'if-none-match': feed.etag || '',
      'if-modified-since': feed.lastModified || '',
      'user-agent': 'FieldguideBot/0.1 (+https://fieldguide.local)'
    }
  });

  if (response.status === 304) {
    await prisma.sourceFeed.update({
      where: {
        id: feed.id
      },
      data: {
        lastCheckedAt: new Date(),
        lastError: null
      }
    });
    return null;
  }

  if (!response.ok) {
    throw new Error(`Feed request failed with status ${response.status} for ${feed.feedUrl}`);
  }

  const body = await response.text();
  const items =
    feed.kind === 'custom'
      ? await fetchCustomAdapterFeed(feed, body)
      : await enrichLinkedFeedCandidates((await parser.parseString(body)).items as ParsedFeedItem[]);

  // The caller stores these only after every item is saved; storing them earlier meant a
  // failed save got a 304 on the next poll and the unsaved items were never retried.
  return {
    items,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  };
}

function deriveFeedItem(sourceFeed: SourceFeedRecord, entry: ParsedFeedItem): IngestedItem | null {
  const title = stripHtml(entry.title || '');
  if (!title) return null;

  const canonicalUrl = normalizeUrl(entry.link || entry.guid || entry.id);
  const dedupeKey = sha1(`${sourceFeed.source.id}|${canonicalUrl || title.toLowerCase()}`);
  const description = stripHtml(entry.contentSnippet || entry.summary || entry.content || '');
  const summary = takeParagraph(description, `A short guide to why "${title}" is worth reading next.`);
  const textForClassification = `${title} ${summary} ${description}`.trim();
  const sourceSubjects = parseSourceSubjects(sourceFeed.source);
  const subject = detectSubject(sourceSubjects, textForClassification, sourceFeed.kind);
  const flags = detectFlags(textForClassification, sourceFeed.source.sourceType);
  const audience = detectAudience(sourceFeed.source.defaultAudience, flags, sourceFeed.source.sourceType);
  const youtubeVideoId = extractYoutubeVideoId(canonicalUrl || entry.id || entry.guid);
  const slugBase = slugify(title) || `item-${dedupeKey.slice(0, 8)}`;
  const imageBaseUrl = canonicalUrl || entry.link || sourceFeed.feedUrl || sourceFeed.source.siteUrl;
  const coverImageUrl =
    extractEntryImageUrl(entry, imageBaseUrl) ||
    (youtubeVideoId ? `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg` : sourceFeed.source.iconUrl);
  const translations = buildTranslationRecords(sourceFeed.source.language, title, summary, `${slugBase}-${dedupeKey.slice(0, 8)}`);
  const tags = buildTagRecords(subject, audience, flags, sourceFeed.kind);

  return {
    dedupeKey,
    slug: `${slugBase}-${dedupeKey.slice(0, 8)}`,
    kind: sourceFeed.kind === 'youtube' || youtubeVideoId ? 'youtube_video' : 'external_article',
    publishedAt: pickPublishedDate(entry),
    originalTitle: title,
    originalSummary: summary,
    bodyMarkdown: description || null,
    coverImageUrl,
    externalUrl: canonicalUrl,
    youtubeVideoId,
    subject,
    audience,
    translations,
    tags,
    promptText: textForClassification
  };
}

async function enrichItemWithAi(input: {
  itemId: string;
  aiConfig: EffectiveAiConfig;
  sourceLanguage: InterfaceLanguage;
  sourceName: string;
  sourceType: string;
  sourceSubjects: SubjectTag[];
  defaultAudience: AudienceLabel;
  kind: FeedKindLike;
  originalTitle: string;
  originalSummary: string;
  bodyMarkdown: string | null;
  promptText: string;
  slugSeed: string;
  fallbackSubject: SubjectTag;
  fallbackFlags: ModerationFlag[];
  fallbackAudience: AudienceLabel;
  fallbackTranslations: IngestedItem['translations'];
}) {
  const budget = createAiBudgetState(input.aiConfig, await getMonthlyAiSpendUsd());
  const languageName = input.sourceLanguage === 'bg' ? 'Bulgarian' : 'English';
  const targetLanguage = input.sourceLanguage === 'bg' ? 'en' : 'bg';
  const targetLanguageName = targetLanguage === 'bg' ? 'Bulgarian' : 'English';
  const mandatoryFlags = input.sourceType === 'community' ? (['not_verified'] as ModerationFlag[]) : [];
  const allowedSubjects = [...new Set<SubjectTag>([...input.sourceSubjects, input.fallbackSubject])];
  const promptBody = clampPromptText(input.bodyMarkdown || input.promptText || '');

  let originalSummary = takeParagraph(input.originalSummary, input.originalSummary);
  let translations = input.fallbackTranslations;
  let subject = input.fallbackSubject;
  let flags = [...new Set<ModerationFlag>([...input.fallbackFlags, ...mandatoryFlags])];
  let audience = input.fallbackAudience;
  let usedAi = false;
  let summaryAudit: AiArtifactAudit | null = null;
  let translationAudit: AiArtifactAudit | null = null;
  let classificationAudit: AiArtifactAudit | null = null;

  const summaryResult = await runBudgetedCompletion<string>({
    purpose: 'summary',
    provider: input.aiConfig.provider,
    configuredModel: input.aiConfig.summaryModel,
    systemPrompt: `You are a careful educational editor. Write a concise factual summary in ${languageName}. Use only the supplied source material, keep it to one short paragraph, and avoid unsupported claims.`,
    userPrompt: [
      `Source: ${input.sourceName}`,
      `Title: ${input.originalTitle}`,
      `Current summary: ${input.originalSummary}`,
      `Body: ${promptBody}`
    ].join('\n'),
    maxOutputTokens: 140,
    budget,
    itemId: input.itemId,
    autoDowngrade: input.aiConfig.autoDowngrade
  });

  if (summaryResult) {
    originalSummary = takeParagraph(summaryResult.output, originalSummary);
    summaryAudit = {
      provider: summaryResult.provider,
      model: summaryResult.model,
      inputTokens: summaryResult.inputTokens,
      outputTokens: summaryResult.outputTokens,
      totalCostUsd: summaryResult.totalCostUsd,
      createdAt: summaryResult.createdAt
    };
    usedAi = true;
  }

  const translationResult = await runBudgetedCompletion<z.infer<typeof translationOutputSchema>>({
    purpose: 'translation',
    provider: input.aiConfig.provider,
    configuredModel: input.aiConfig.translationModel,
    systemPrompt: `Translate educational copy into ${targetLanguageName}. Return JSON only with keys "language", "title", and "summary". Preserve meaning, keep the title concise, and keep the summary to one short paragraph.`,
    userPrompt: [
      `Source language: ${input.sourceLanguage}`,
      `Target language: ${targetLanguage}`,
      `Title: ${input.originalTitle}`,
      `Summary: ${originalSummary}`
    ].join('\n'),
    maxOutputTokens: 150,
    budget,
    itemId: input.itemId,
    autoDowngrade: input.aiConfig.autoDowngrade,
    parser: (text) => parseJsonCompletion(text, translationOutputSchema)
  });

  if (translationResult) {
    translationAudit = {
      provider: translationResult.provider,
      model: translationResult.model,
      inputTokens: translationResult.inputTokens,
      outputTokens: translationResult.outputTokens,
      totalCostUsd: translationResult.totalCostUsd,
      createdAt: translationResult.createdAt
    };
    translations = buildLocalizedTranslationRecords(
      input.sourceLanguage,
      input.originalTitle,
      originalSummary,
      {
        ...translationResult.output,
        language: targetLanguage
      },
      input.slugSeed,
      translationAudit
    );
    usedAi = true;
  }

  const classificationResult = await runBudgetedCompletion<z.infer<typeof classificationOutputSchema>>({
    purpose: 'classification',
    provider: input.aiConfig.provider,
    configuredModel: input.aiConfig.translationModel,
    systemPrompt:
      'Classify educational content for a moderated feed. Return JSON only with keys "subject" and "flags". Choose the closest subject from the allowed list and only include flags that are clearly supported by the text.',
    userPrompt: [
      `Allowed subjects: ${allowedSubjects.join(', ')}`,
      `Possible flags: nsfw, spoiler, gore, sensitive_history${input.sourceType === 'community' ? ', not_verified' : ''}`,
      `Source type: ${input.sourceType}`,
      `Default audience: ${input.defaultAudience}`,
      `Kind: ${input.kind}`,
      `Title: ${input.originalTitle}`,
      `Summary: ${originalSummary}`,
      `Body: ${promptBody}`
    ].join('\n'),
    maxOutputTokens: 110,
    budget,
    itemId: input.itemId,
    autoDowngrade: input.aiConfig.autoDowngrade,
    parser: (text) => parseJsonCompletion(text, classificationOutputSchema)
  });

  if (classificationResult) {
    const nextSubject = allowedSubjects.includes(classificationResult.output.subject)
      ? classificationResult.output.subject
      : input.fallbackSubject;
    const nextFlags = [...new Set<ModerationFlag>([...classificationResult.output.flags, ...mandatoryFlags])];
    subject = nextSubject;
    flags = nextFlags;
    audience = detectAudience(input.defaultAudience, flags, input.sourceType);
    classificationAudit = {
      provider: classificationResult.provider,
      model: classificationResult.model,
      inputTokens: classificationResult.inputTokens,
      outputTokens: classificationResult.outputTokens,
      totalCostUsd: classificationResult.totalCostUsd,
      createdAt: classificationResult.createdAt
    };
    usedAi = true;
  }

  return {
    originalSummary,
    translations,
    subject,
    audience,
    tags: buildTagRecords(subject, audience, flags, input.kind),
    usedAi,
    summaryAudit,
    translationAudit,
    classificationAudit
  } satisfies EnrichmentResult;
}

// Tag types an admin can set from moderation; once an item is moderated these are never overwritten.
const ADMIN_OWNED_TAG_TYPES = ['flag', 'audience'] as const;

function isAdminOwnedTag(tag: { type: string }) {
  return (ADMIN_OWNED_TAG_TYPES as readonly string[]).includes(tag.type);
}

async function persistContentItem(sourceFeed: SourceFeedRecord, input: IngestedItem) {
  const contentHash = computeContentHash({
    title: input.originalTitle,
    summary: input.originalSummary,
    body: input.bodyMarkdown || input.promptText,
    externalUrl: input.externalUrl,
    sourceId: sourceFeed.source.id,
    kind: input.kind
  });
  const existing = await prisma.contentItem.findUnique({
    where: {
      dedupeKey: input.dedupeKey
    },
    select: {
      id: true,
      slug: true,
      aiContentHash: true,
      moderatedAt: true,
      summaryAiGeneratedAt: true,
      classificationAiGeneratedAt: true,
      translations: {
        where: {
          aiGeneratedAt: {
            not: null
          }
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  });

  if (existing) {
    const hasExistingAiArtifacts = Boolean(
      existing.summaryAiGeneratedAt && existing.classificationAiGeneratedAt && existing.translations.length > 0
    );
    // Same content as last time: leave the item alone so admin moderation, AI translations
    // and the original publish date survive every poll.
    if (existing.aiContentHash === contentHash) {
      return { created: false, itemId: existing.id, contentHash, needsEnrichment: !hasExistingAiArtifacts };
    }

    const moderated = Boolean(existing.moderatedAt);
    await prisma.contentItem.update({
      where: {
        id: existing.id
      },
      data: {
        kind: input.kind,
        originalTitle: input.originalTitle,
        originalSummary: input.originalSummary,
        aiContentHash: contentHash,
        bodyMarkdown: input.bodyMarkdown,
        coverImageUrl: input.coverImageUrl,
        externalUrl: input.externalUrl,
        youtubeVideoId: input.youtubeVideoId,
        subject: input.subject,
        ...(moderated ? {} : { audience: input.audience }),
        translations: {
          deleteMany: {},
          create: toTranslationWriteRecords(input.translations)
        },
        tags: {
          deleteMany: moderated ? { type: { notIn: [...ADMIN_OWNED_TAG_TYPES] } } : {},
          create: moderated ? input.tags.filter((tag) => !isAdminOwnedTag(tag)) : input.tags
        }
      }
    });
    return { created: false, itemId: existing.id, contentHash, needsEnrichment: true };
  }

  const item = await prisma.contentItem.create({
    data: {
      id: `item-${randomUUID()}`,
      slug: input.slug,
      dedupeKey: input.dedupeKey,
      kind: input.kind,
      sourceId: sourceFeed.source.id,
      publishedAt: input.publishedAt,
      originalTitle: input.originalTitle,
      originalSummary: input.originalSummary,
      aiContentHash: contentHash,
      bodyMarkdown: input.bodyMarkdown,
      coverImageUrl: input.coverImageUrl,
      externalUrl: input.externalUrl,
      youtubeVideoId: input.youtubeVideoId,
      subject: input.subject,
      audience: input.audience,
      translations: {
        create: toTranslationWriteRecords(input.translations)
      },
      tags: {
        create: input.tags
      }
    },
    select: {
      id: true
    }
  });

  return {
    created: true,
    itemId: item.id,
    contentHash,
    needsEnrichment: true
  };
}

async function refreshItemMetadata(itemId: string, expectedContentHash?: string) {
  const item = await prisma.contentItem.findUnique({
    where: {
      id: itemId
    },
    include: {
      source: true,
      translations: {
        where: {
          aiGeneratedAt: {
            not: null
          }
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  });
  if (!item) {
    throw new Error('Item not found.');
  }

  const contentHash = computeContentHash({
    title: item.originalTitle,
    summary: item.originalSummary,
    body: item.bodyMarkdown,
    externalUrl: item.externalUrl,
    sourceId: item.sourceId,
    kind: item.kind
  });
  const hasAiArtifacts = Boolean(
    item.summaryAiGeneratedAt &&
      item.classificationAiGeneratedAt &&
      item.translations.length > 0
  );
  if (expectedContentHash && item.aiContentHash && expectedContentHash !== item.aiContentHash) {
    return { ok: true, skipped: true, reason: 'stale_enrichment_job' as const };
  }
  if (item.aiContentHash === contentHash && hasAiArtifacts) {
    return { ok: true, skipped: true, reason: 'already_enriched' as const };
  }

  const promptText = clampPromptText(`${item.originalTitle} ${item.originalSummary} ${item.bodyMarkdown || ''}`.trim());
  const sourceSubjects = parseSourceSubjects(item.source);
  const fallbackSummary = takeParagraph(item.bodyMarkdown || item.originalSummary, item.originalSummary);
  const fallbackSubject = detectSubject(sourceSubjects, promptText, item.kind === 'youtube_video' ? 'youtube' : 'rss');
  const fallbackFlags = detectFlags(promptText, item.source.sourceType);
  const fallbackAudience = detectAudience(item.source.defaultAudience, fallbackFlags, item.source.sourceType);
  const fallbackTranslations = buildTranslationRecords(item.source.language, item.originalTitle, fallbackSummary, item.slug);
  const enrichment = await enrichItemWithAi({
    itemId,
    aiConfig: await getAiConfig(),
    sourceLanguage: item.source.language,
    sourceName: item.source.name,
    sourceType: item.source.sourceType,
    sourceSubjects,
    defaultAudience: item.source.defaultAudience,
    kind: item.kind === 'youtube_video' ? 'youtube' : 'rss',
    originalTitle: item.originalTitle,
    originalSummary: fallbackSummary,
    bodyMarkdown: item.bodyMarkdown,
    promptText,
    slugSeed: item.slug,
    fallbackSubject,
    fallbackFlags,
    fallbackAudience,
    fallbackTranslations
  });

  await prisma.contentItem.update({
    where: {
      id: itemId
    },
    data: {
      originalSummary: enrichment.originalSummary,
      aiContentHash: contentHash,
      summaryAiProvider: enrichment.summaryAudit?.provider || null,
      summaryAiModel: enrichment.summaryAudit?.model || null,
      summaryAiInputTokens: enrichment.summaryAudit?.inputTokens || null,
      summaryAiOutputTokens: enrichment.summaryAudit?.outputTokens || null,
      summaryAiTotalCostUsd: enrichment.summaryAudit?.totalCostUsd || null,
      summaryAiGeneratedAt: enrichment.summaryAudit?.createdAt || null,
      subject: enrichment.subject,
      classificationAiProvider: enrichment.classificationAudit?.provider || null,
      classificationAiModel: enrichment.classificationAudit?.model || null,
      classificationAiInputTokens: enrichment.classificationAudit?.inputTokens || null,
      classificationAiOutputTokens: enrichment.classificationAudit?.outputTokens || null,
      classificationAiTotalCostUsd: enrichment.classificationAudit?.totalCostUsd || null,
      classificationAiGeneratedAt: enrichment.classificationAudit?.createdAt || null,
      ...(item.moderatedAt ? {} : { audience: enrichment.audience }),
      translations: {
        deleteMany: {},
        create: toTranslationWriteRecords(enrichment.translations)
      },
      tags: {
        deleteMany: item.moderatedAt ? { type: { notIn: [...ADMIN_OWNED_TAG_TYPES] } } : {},
        create: item.moderatedAt ? enrichment.tags.filter((tag) => !isAdminOwnedTag(tag)) : enrichment.tags
      }
    }
  });
  return { ok: true, skipped: false as const };
}

async function selectNewsletterItems(user: NewsletterUserRecord, cadence: 'daily' | 'weekly', aiConfig: EffectiveAiConfig) {
  const [hidden, delivered, saved, viewed] = await Promise.all([
    prisma.hiddenItem.findMany({
      where: {
        userId: user.id
      },
      include: {
        item: {
          select: {
            id: true,
            subject: true,
            tags: {
              select: {
                type: true,
                value: true
              }
            }
          }
        }
      }
    }),
    prisma.newsletterDeliveryItem.findMany({
      where: {
        delivery: {
          userId: user.id,
          cadence
        }
      },
      select: {
        itemId: true
      }
    }),
    prisma.savedItem.findMany({
      where: {
        userId: user.id
      },
      include: {
        item: {
          select: {
            id: true,
            subject: true,
            tags: {
              select: {
                type: true,
                value: true
              }
            }
          }
        }
      }
    }),
    prisma.itemView.findMany({
      where: {
        userId: user.id
      },
      include: {
        item: {
          select: {
            id: true,
            subject: true,
            tags: {
              select: {
                type: true,
                value: true
              }
            }
          }
        }
      }
    })
  ]);

  const items = await prisma.contentItem.findMany({
    where: {
      removedAt: null
    },
    include: {
      source: true,
      translations: true,
      tags: true
    },
    orderBy: {
      publishedAt: 'desc'
    },
    take: 40
  });

  const desiredCount = cadence === 'daily' ? 3 : 5;
  const heuristicRanked = rankNewsletterCandidates({
    candidates: items,
    saved: saved.map((entry) => entry.item),
    viewed: viewed.map((entry) => ({
      ...entry.item,
      viewCount: entry.viewCount
    })),
    hidden: hidden.map((entry) => entry.item),
    deliveredIds: delivered.map((entry) => entry.itemId),
    mode: user.settings?.contentMode || 'standard'
  });

  const candidatePool = heuristicRanked.slice(0, Math.max(desiredCount * 3, desiredCount + 3));
  if (candidatePool.length <= desiredCount) {
    return {
      items: candidatePool.slice(0, desiredCount),
      audit: null as AiArtifactAudit | null
    };
  }

  const preferenceWeights = buildPreferenceWeights({
    saved: saved.map((entry) => entry.item),
    viewed: viewed.map((entry) => ({
      ...entry.item,
      viewCount: entry.viewCount
    })),
    hidden: hidden.map((entry) => entry.item)
  });
  const signalSummary = summarizePreferenceWeights(preferenceWeights);
  const budget = createAiBudgetState(aiConfig, await getMonthlyAiSpendUsd());
  const language = user.settings?.language || 'en';
  const selection = await runBudgetedCompletion<z.infer<typeof newsletterSelectionSchema>>({
    purpose: 'newsletter',
    provider: aiConfig.provider,
    configuredModel: aiConfig.newsletterModel,
    autoDowngrade: aiConfig.autoDowngrade,
    systemPrompt: `You are selecting educational newsletter items for a personalized digest. Return JSON only with key "selectedIds". Choose exactly ${desiredCount} ids from the provided candidates. Prefer items that align with positive saved/viewed signals, avoid hidden-pattern signals, respect the content mode, and keep the mix varied when several candidates are very similar.`,
    userPrompt: [
      `Cadence: ${cadence}`,
      `Target count: ${desiredCount}`,
      `Reader language: ${language}`,
      `Reader content mode: ${user.settings?.contentMode || 'standard'}`,
      `Positive preference signals: ${signalSummary.positive.length ? signalSummary.positive.join(', ') : 'none recorded'}`,
      `Avoided signals: ${signalSummary.negative.length ? signalSummary.negative.join(', ') : 'none recorded'}`,
      `Saved items observed: ${saved.length}`,
      `Viewed items observed: ${viewed.length}`,
      `Hidden items observed: ${hidden.length}`,
      ...candidatePool.map(
        (item, index) =>
          [
            `${index + 1}. id=${item.id}`,
            `Title: ${localizedTitle(item, language)}`,
            `Source: ${item.source.name}`,
            `Subject: ${item.subject}`,
            `Tags: ${item.tags.map((tag) => `${tag.type}:${tag.value}`).join(', ') || 'none'}`,
            `Published: ${item.publishedAt.toISOString()}`,
            `Summary: ${localizedSummary(item, language)}`
          ].join('\n')
      )
    ].join('\n\n'),
    maxOutputTokens: 120,
    budget,
    userId: user.id,
    parser: (text) => parseJsonCompletion(text, newsletterSelectionSchema)
  });

  if (!selection) {
    return {
      items: heuristicRanked.slice(0, desiredCount),
      audit: null as AiArtifactAudit | null
    };
  }

  return {
    items: mergeSelectedCandidates({
      candidates: candidatePool,
      selectedIds: selection.output.selectedIds,
      limit: desiredCount
    }),
    audit: {
      provider: selection.provider,
      model: selection.model,
      inputTokens: selection.inputTokens,
      outputTokens: selection.outputTokens,
      totalCostUsd: selection.totalCostUsd,
      createdAt: selection.createdAt
    }
  };
}

async function createNewsletterSummary(input: {
  user: NewsletterUserRecord;
  cadence: 'daily' | 'weekly';
  subjectLine: string;
  items: NewsletterItemRecord[];
  aiConfig: EffectiveAiConfig;
}) {
  const language = input.user.settings?.language || 'en';
  const fallbackHighlights = input.items.map((item) => localizedTitle(item, language));
  const fallback = {
    intro:
      language === 'bg'
        ? input.cadence === 'daily'
          ? 'Ето няколко образователни материала, които може да си пропуснал.'
          : 'Ето по-дълга седмична селекция с образователни акценти.'
        : input.cadence === 'daily'
          ? 'Here are a few educational pieces you may have missed.'
          : 'Here is a longer set of educational highlights selected for your week.',
    highlights: fallbackHighlights,
    audit: null as AiArtifactAudit | null
  };
  const budget = createAiBudgetState(input.aiConfig, await getMonthlyAiSpendUsd());
  const promptLanguage = language === 'bg' ? 'Bulgarian' : 'English';
  const completion = await runBudgetedCompletion<z.infer<typeof newsletterOutputSchema>>({
    purpose: 'newsletter',
    provider: input.aiConfig.provider,
    configuredModel: input.aiConfig.newsletterModel,
    autoDowngrade: input.aiConfig.autoDowngrade,
    systemPrompt: `You write concise educational newsletters in ${promptLanguage}. Return JSON only with keys "intro" and "highlights". The intro should be one short paragraph. Provide exactly one highlight sentence per article.`,
    userPrompt: [
      `Cadence: ${input.cadence}`,
      `Subject line: ${input.subjectLine}`,
      `Reader language: ${language}`,
      `Reader content mode: ${input.user.settings?.contentMode || 'standard'}`,
      ...input.items.map(
        (item, index) =>
          `${index + 1}. Title: ${localizedTitle(item, language)}\nSource: ${item.source.name}\nSummary: ${localizedSummary(item, language)}`
      )
    ].join('\n\n'),
    maxOutputTokens: 180,
    budget,
    userId: input.user.id,
    parser: (text) => parseJsonCompletion(text, newsletterOutputSchema)
  });

  if (!completion) {
    return fallback;
  }

  return {
    intro: completion.output.intro,
    highlights: input.items.map((item, index) => completion.output.highlights[index] || localizedTitle(item, language)),
    audit: {
      provider: completion.provider,
      model: completion.model,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      totalCostUsd: completion.totalCostUsd,
      createdAt: completion.createdAt
    }
  };
}

function buildGeneratedStoryCitation(item: GeneratedStorySourceItem): GeneratedStoryCitation | null {
  const url = item.externalUrl || item.source.siteUrl;
  if (!url) return null;
  return {
    title: item.originalTitle,
    url,
    sourceName: item.source.name,
    publishedAt: item.publishedAt.toISOString(),
    excerpt: item.originalSummary
  };
}

async function loadGeneratedStorySourcePack(subject: SubjectTag) {
  const items = await prisma.contentItem.findMany({
    where: {
      OR: [
        {
          subject
        },
        {
          tags: {
            some: {
              type: 'subject',
              value: subject
            }
          }
        }
      ],
      removedAt: null,
      kind: {
        in: ['external_article', 'youtube_video']
      },
      source: {
        status: 'active'
      }
    },
    include: {
      source: true,
      translations: true,
      tags: true
    },
    orderBy: {
      publishedAt: 'desc'
    },
    take: 10
  });

  const seen = new Set<string>();
  const citations: GeneratedStoryCitation[] = [];
  for (const item of items) {
    const citation = buildGeneratedStoryCitation(item);
    if (!citation || seen.has(citation.url)) continue;
    seen.add(citation.url);
    citations.push(citation);
  }
  return citations.slice(0, 4);
}

function formatGeneratedStorySourcePack(citations: GeneratedStoryCitation[]) {
  return citations
    .map(
      (citation, index) =>
        [
          `[${index + 1}] ${citation.title}`,
          `Source: ${citation.sourceName}`,
          `URL: ${citation.url}`,
          `Published: ${citation.publishedAt || 'unknown'}`,
          `Source excerpt: ${clampPromptText(citation.excerpt || 'No excerpt available.', 280)}`
        ].join('\n')
    )
    .join('\n\n');
}

async function failGeneratedStoryDraft(draftId: string, failureReason: string, patch: Prisma.GeneratedStoryDraftUpdateInput = {}) {
  await prisma.generatedStoryDraft.update({
    where: {
      id: draftId
    },
    data: {
      ...patch,
      status: 'failed',
      failureReason
    }
  });
  await recordSystemError('ai', 'warn', `Generated story draft ${draftId} failed: ${failureReason}`);
}

async function generateStoryDraft(input: {
  draftId: string;
  userId: string;
  subject: SubjectTag;
  prompt: string;
  aiConfig: EffectiveAiConfig;
  citations: GeneratedStoryCitation[];
  budget: AiBudgetState;
}) {
  const sourcePack = formatGeneratedStorySourcePack(input.citations);
  const generation = await runBudgetedCompletion<z.infer<typeof generatedStoryOutputSchema>>({
    purpose: 'generated_story',
    provider: input.aiConfig.provider,
    configuredModel: input.aiConfig.newsletterModel,
    autoDowngrade: input.aiConfig.autoDowngrade,
    temperature: 0.25,
    systemPrompt:
      'You are a careful educational editor creating an original, concise feed story from a provided source pack. Return JSON only with keys "title", "summary", "bodyMarkdown", and "citedUrls". Use only facts present in the source pack, cite sources inline as markdown links, do not invent facts, and do not reproduce full article bodies.',
    userPrompt: [
      `Subject: ${input.subject}`,
      `Admin request: ${input.prompt}`,
      'Source pack:',
      sourcePack,
      'Draft requirements:',
      '- Write 4 to 7 short paragraphs.',
      '- Every concrete claim must be supported by at least one cited URL from the source pack.',
      '- The summary must be one paragraph.',
      '- citedUrls must contain only URLs from the source pack that are actually used.'
    ].join('\n\n'),
    maxOutputTokens: 700,
    budget: input.budget,
    userId: input.userId,
    parser: (text) => parseJsonCompletion(text, generatedStoryOutputSchema)
  });

  if (!generation) return null;

  const allowedUrls = new Set(input.citations.map((citation) => citation.url));
  const usedCitations = input.citations.filter((citation) => generation.output.citedUrls.includes(citation.url) && allowedUrls.has(citation.url));
  const finalCitations = usedCitations.length ? usedCitations : input.citations.slice(0, 3);

  const verification = await runBudgetedCompletion<GeneratedStoryVerification>({
    purpose: 'generated_story_verification',
    provider: input.aiConfig.provider,
    configuredModel: input.aiConfig.translationModel,
    autoDowngrade: input.aiConfig.autoDowngrade,
    temperature: 0,
    systemPrompt:
      'You verify educational drafts against cited source material. Return JSON only with keys "passed", "score", "notes", and "unsupportedClaims". Pass only when the draft is grounded in the source pack and all cited URLs are from the source pack.',
    userPrompt: [
      `Subject: ${input.subject}`,
      'Source pack:',
      sourcePack,
      'Draft title:',
      generation.output.title,
      'Draft summary:',
      generation.output.summary,
      'Draft body:',
      generation.output.bodyMarkdown,
      `Draft cited URLs: ${generation.output.citedUrls.join(', ')}`
    ].join('\n\n'),
    maxOutputTokens: 180,
    budget: input.budget,
    userId: input.userId,
    parser: (text) => parseJsonCompletion(text, generatedStoryVerificationSchema)
  });

  if (!verification) {
    return {
      output: generation.output,
      citations: finalCitations,
      verification: null,
      totalCostUsd: generation.totalCostUsd
    };
  }

  return {
    output: generation.output,
    citations: finalCitations,
    verification: verification.output,
    totalCostUsd: generation.totalCostUsd + verification.totalCostUsd
  };
}

export async function bootstrapRecurringJobs(queues: SchedulerQueues) {
  await ensureDefaultSourceRegistry();

  const [feeds, users] = await Promise.all([
    prisma.sourceFeed.findMany({
      where: {
        source: {
          status: {
            not: 'paused'
          },
          sourceType: {
            not: 'community'
          }
        }
      }
    }),
    prisma.user.findMany({
      where: {
        suspendedAt: null,
        settings: {
          is: {
            newsletterEnabled: true
          }
        }
      },
      include: {
        settings: true
      }
    })
  ]);

  const runStartupIngestion = queues.runStartupIngestion ?? false;

  await Promise.all(
    feeds.flatMap((feed) => {
      const jobs: Promise<unknown>[] = [];
      if (runStartupIngestion) {
        const startupJobId = toJobId('source-startup', feed.sourceId);
        jobs.push(
          queues.ingestion.add(
            startupJobId,
            {
              sourceId: feed.sourceId,
              feedUrl: feed.feedUrl
            },
            {
              jobId: startupJobId,
              removeOnComplete: true,
              removeOnFail: 50
            }
          )
        );
      }
      const repeatJobId = toJobId('source', feed.sourceId);
      jobs.push(
        queues.ingestion.add(
          repeatJobId,
          {
            sourceId: feed.sourceId,
            feedUrl: feed.feedUrl
          },
          {
            jobId: repeatJobId,
            repeat: {
              every: Math.max(feed.pollIntervalSec, 60) * 1000
            },
            removeOnComplete: true,
            removeOnFail: 50
          }
        )
      );
      return jobs;
    })
  );

  const newsletterRepeatableJobs = await queues.newsletter.getRepeatableJobs();
  await Promise.all(
    newsletterRepeatableJobs
      .filter((job) => job.id?.startsWith('newsletter-'))
      .map((job) => queues.newsletter.removeRepeatableByKey(job.key))
  );

  await Promise.all(
    users.map((user) => {
      const cadence = user.settings?.newsletterCadence || 'weekly';
      const newsletterJobId = toJobId('newsletter', user.username, cadence);
      return queues.newsletter.add(
        newsletterJobId,
        {
          username: user.username,
          mode: cadence
        },
        {
          jobId: newsletterJobId,
          repeat: {
            every: cadence === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
          },
          removeOnComplete: true,
          removeOnFail: 50
        }
      );
    })
  );
}

export async function waitForProcessorServicesReady() {
  await prisma.$queryRaw`SELECT 1`;
}

export async function shutdownProcessorServices() {
  await prisma.$disconnect();
}

export async function processIngestionJob(
  payload: IngestionJobPayload,
  options?: {
    aiEnrichmentQueue?: Queue<AiEnrichmentJobPayload>;
  }
) {
  const sourceFeed = await loadSourceFeed(payload);
  if (!sourceFeed) {
    throw new Error(`Source feed not found for ${payload.sourceId || payload.feedUrl}`);
  }

  if (sourceFeed.source.sourceType === 'community') {
    await Promise.all([
      prisma.source.update({
        where: {
          id: sourceFeed.source.id
        },
        data: {
          status: 'active'
        }
      }),
      prisma.sourceFeed.update({
        where: {
          id: sourceFeed.id
        },
        data: {
          lastCheckedAt: new Date(),
          lastError: null
        }
      })
    ]);
    return {
      ok: true,
      sourceName: sourceFeed.source.name,
      discoveredItems: 0,
      createdItems: 0,
      updatedItems: 0,
      polledAt: new Date().toISOString(),
      skipped: true
    };
  }

  if (sourceFeed.source.status === 'paused') {
    await prisma.sourceFeed.update({
      where: {
        id: sourceFeed.id
      },
      data: {
        lastCheckedAt: new Date(),
        lastError: null
      }
    });
    return {
      ok: true,
      sourceName: sourceFeed.source.name,
      discoveredItems: 0,
      createdItems: 0,
      updatedItems: 0,
      polledAt: new Date().toISOString(),
      skipped: true
    };
  }

  try {
    const fetched = await fetchFeed(sourceFeed);
    if (!fetched) {
      await prisma.source.update({
        where: {
          id: sourceFeed.source.id
        },
        data: {
          status: 'active'
        }
      });
      return {
        ok: true,
        sourceName: sourceFeed.source.name,
        discoveredItems: 0,
        createdItems: 0,
        updatedItems: 0,
        polledAt: new Date().toISOString()
      };
    }

    let createdItems = 0;
    let updatedItems = 0;
    let discoveredItems = 0;
    const enqueuedEnrichmentIds: string[] = [];

    // Every entry in the feed is checked against what's stored (by dedupe key), rather than
    // skipping entries older than the last poll. A date cutoff lost items for good whenever
    // a feed was down, paused, or a save failed part-way; unchanged items are a cheap no-op.
    for (const entry of fetched.items.slice(0, INGESTION_FEED_ITEM_LIMIT)) {
      const derived = deriveFeedItem(sourceFeed, entry);
      if (!derived) continue;
      discoveredItems += 1;
      const result = await persistContentItem(sourceFeed, derived);
      if (result.created) {
        createdItems += 1;
      } else {
        updatedItems += 1;
      }
      if (
        result.needsEnrichment &&
        enqueuedEnrichmentIds.length < INGESTION_ENRICHMENT_MAX_PER_RUN &&
        options?.aiEnrichmentQueue
      ) {
        const jobId = `ai-enrichment:${result.itemId}:${result.contentHash}`;
        await options.aiEnrichmentQueue.add(
          jobId,
          {
            itemId: result.itemId,
            contentHash: result.contentHash,
            tasks: ['summary', 'translation', 'classification']
          },
          {
            jobId,
            removeOnComplete: true,
            removeOnFail: 50
          }
        );
        enqueuedEnrichmentIds.push(result.itemId);
      }
    }

    await Promise.all([
      prisma.source.update({
        where: {
          id: sourceFeed.source.id
        },
        data: {
          status: 'active'
        }
      }),
      prisma.sourceFeed.update({
        where: {
          id: sourceFeed.id
        },
        data: {
          etag: fetched.etag,
          lastModified: fetched.lastModified,
          lastCheckedAt: new Date(),
          lastError: null
        }
      })
    ]);

    return {
      ok: true,
      sourceName: sourceFeed.source.name,
      discoveredItems,
      createdItems,
      updatedItems,
      enqueuedAiEnrichment: enqueuedEnrichmentIds.length,
      polledAt: new Date().toISOString()
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion failure.';
    await Promise.all([
      prisma.source.update({
        where: {
          id: sourceFeed.source.id
        },
        data: {
          status: 'error'
        }
      }),
      prisma.sourceFeed.update({
        where: {
          id: sourceFeed.id
        },
        data: {
          lastCheckedAt: new Date(),
          lastError: message
        }
      }),
      recordSystemError('ingestion', 'error', `${sourceFeed.feedUrl}: ${message}`)
    ]);
    return {
      ok: false,
      sourceName: sourceFeed.source.name,
      discoveredItems: 0,
      createdItems: 0,
      updatedItems: 0,
      polledAt: new Date().toISOString(),
      error: message
    };
  }
}

export async function processAiEnrichmentJob(payload: AiEnrichmentJobPayload) {
  const result = await refreshItemMetadata(payload.itemId, payload.contentHash);
  return {
    ok: true,
    itemId: payload.itemId,
    skipped: result.skipped || false,
    completedTasks: payload.tasks
  };
}

export async function processGeneratedStoryJob(payload: GeneratedStoryJobPayload) {
  const draft = await prisma.generatedStoryDraft.findUnique({
    where: {
      id: payload.draftId
    },
    include: {
      requestedBy: true
    }
  });
  if (!draft) {
    throw new Error(`Generated story draft not found for ${payload.draftId}`);
  }
  if (draft.status !== 'queued') {
    return {
      ok: true,
      draftId: draft.id,
      skipped: true,
      status: draft.status
    };
  }

  const citations = await loadGeneratedStorySourcePack(draft.subject);
  if (!citations.length) {
    await failGeneratedStoryDraft(draft.id, `No ingested source items are available for ${draft.subject}. Run source ingestion first.`, {
      citationsJson: JSON.stringify([])
    });
    return {
      ok: false,
      draftId: draft.id,
      status: 'failed',
      reason: 'no_source_pack'
    };
  }

  const aiConfig = await getAiConfig();
  const monthlySpent = await getMonthlyAiSpendUsd();
  const monthlyRemaining = Math.max(0, aiConfig.monthlyBudgetUsd - monthlySpent);
  if (monthlyRemaining <= 0) {
    await failGeneratedStoryDraft(draft.id, `Monthly AI budget cap reached: $${aiConfig.monthlyBudgetUsd.toFixed(2)}.`, {
      citationsJson: JSON.stringify(citations)
    });
    return {
      ok: false,
      draftId: draft.id,
      status: 'failed',
      reason: 'monthly_cap'
    };
  }

  const result = await generateStoryDraft({
    draftId: draft.id,
    userId: draft.requestedById,
    subject: draft.subject,
    prompt: draft.prompt,
    aiConfig,
    citations,
    budget: {
      remainingJobBudgetUsd: aiConfig.perJobBudgetUsd,
      remainingMonthlyBudgetUsd: monthlyRemaining
    }
  });

  if (!result) {
    await failGeneratedStoryDraft(draft.id, 'AI provider, key, or budget prevented generation.', {
      citationsJson: JSON.stringify(citations)
    });
    return {
      ok: false,
      draftId: draft.id,
      status: 'failed',
      reason: 'generation_unavailable'
    };
  }

  if (!result.verification) {
    await failGeneratedStoryDraft(draft.id, 'Verifier pass did not complete, so the draft was not made approvable.', {
      title: result.output.title,
      summary: result.output.summary,
      bodyMarkdown: result.output.bodyMarkdown,
      citationsJson: JSON.stringify(result.citations),
      totalCostUsd: result.totalCostUsd,
      generatedAt: new Date()
    });
    return {
      ok: false,
      draftId: draft.id,
      status: 'failed',
      reason: 'verification_unavailable'
    };
  }

  const verificationPassed = result.verification.passed && result.verification.score >= 0.78 && result.verification.unsupportedClaims.length === 0;
  await prisma.generatedStoryDraft.update({
    where: {
      id: draft.id
    },
    data: {
      status: verificationPassed ? 'draft' : 'failed',
      title: result.output.title,
      summary: takeParagraph(result.output.summary, result.output.summary),
      bodyMarkdown: result.output.bodyMarkdown,
      citationsJson: JSON.stringify(result.citations),
      verificationJson: JSON.stringify(result.verification),
      failureReason: verificationPassed
        ? null
        : `Verifier rejected the draft with score ${result.verification.score.toFixed(2)}: ${result.verification.notes}`,
      totalCostUsd: result.totalCostUsd,
      generatedAt: new Date()
    }
  });

  return {
    ok: verificationPassed,
    draftId: draft.id,
    status: verificationPassed ? 'draft' : 'failed',
    verifierScore: result.verification.score,
    totalCostUsd: result.totalCostUsd
  };
}

export async function processNewsletterJob(payload: NewsletterJobPayload) {
  const user = await prisma.user.findUnique({
    where: {
      username: payload.username
    },
    include: {
      settings: true
    }
  });

  if (!user?.settings || user.suspendedAt || !user.settings.newsletterEnabled) {
    return {
      ok: true,
      username: payload.username,
      cadence: payload.mode,
      subjectLine: payload.mode === 'daily' ? 'Your Fieldguide daily digest' : 'Your Fieldguide weekly digest',
      articleTitles: []
    };
  }
  const settings = user.settings;

  const aiConfig = await getAiConfig();
  const cadence = payload.mode;
  const subjectLine = cadence === 'daily' ? 'Your Fieldguide daily digest' : 'Your Fieldguide weekly digest';
  const selection = await selectNewsletterItems(user, cadence, aiConfig);
  const rankedItems = selection.items;

  if (!rankedItems.length) {
    await prisma.newsletterDelivery.create({
      data: {
        userId: user.id,
        cadence,
        status: 'skipped',
        subjectLine,
        summaryText: 'No new eligible articles were available for this digest.',
        selectionAiProvider: selection.audit?.provider || null,
        selectionAiModel: selection.audit?.model || null,
        selectionAiInputTokens: selection.audit?.inputTokens || null,
        selectionAiOutputTokens: selection.audit?.outputTokens || null,
        selectionAiTotalCostUsd: selection.audit?.totalCostUsd || null,
        selectionAiGeneratedAt: selection.audit?.createdAt || null
      }
    });
    return {
      ok: true,
      username: user.username,
      cadence,
      subjectLine,
      articleTitles: []
    };
  }

  const newsletterCopy = await createNewsletterSummary({
    user,
    cadence,
    subjectLine,
    items: rankedItems,
    aiConfig
  });
  const summaryText = [newsletterCopy.intro, '', ...newsletterCopy.highlights.map((entry, index) => `${index + 1}. ${entry}`)]
    .join('\n')
    .trim();

  const delivery = await prisma.newsletterDelivery.create({
    data: {
      userId: user.id,
      cadence,
      status: config.ENABLE_EMAIL && resend ? 'queued' : 'skipped',
      subjectLine,
      summaryText,
      selectionAiProvider: selection.audit?.provider || null,
      selectionAiModel: selection.audit?.model || null,
      selectionAiInputTokens: selection.audit?.inputTokens || null,
      selectionAiOutputTokens: selection.audit?.outputTokens || null,
      selectionAiTotalCostUsd: selection.audit?.totalCostUsd || null,
      selectionAiGeneratedAt: selection.audit?.createdAt || null,
      summaryAiProvider: newsletterCopy.audit?.provider || null,
      summaryAiModel: newsletterCopy.audit?.model || null,
      summaryAiInputTokens: newsletterCopy.audit?.inputTokens || null,
      summaryAiOutputTokens: newsletterCopy.audit?.outputTokens || null,
      summaryAiTotalCostUsd: newsletterCopy.audit?.totalCostUsd || null,
      summaryAiGeneratedAt: newsletterCopy.audit?.createdAt || null,
      items: {
        create: rankedItems.map((item, index) => ({
          itemId: item.id,
          position: index
        }))
      }
    }
  });

  if (!config.ENABLE_EMAIL || !resend) {
    return {
      ok: true,
      username: user.username,
      cadence,
      subjectLine,
      articleTitles: rankedItems.map((item) => localizedTitle(item, settings.language))
    };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h1>${escapeHtml(subjectLine)}</h1>
      <p>${escapeHtml(newsletterCopy.intro)}</p>
      <ol>
        ${rankedItems
          .map(
            (item, index) =>
              `<li><a href="${config.APP_URL}/item/${item.slug}">${escapeHtml(localizedTitle(item, settings.language))}</a> <span style="color:#666;">from ${escapeHtml(item.source.name)}</span><br/>${escapeHtml(newsletterCopy.highlights[index] || localizedSummary(item, settings.language))}</li>`
          )
          .join('')}
      </ol>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: config.EMAIL_FROM,
      to: user.email,
      subject: subjectLine,
      html,
      text: `${subjectLine}\n\n${newsletterCopy.intro}\n\n${rankedItems
        .map(
          (item, index) =>
            `${index + 1}. ${localizedTitle(item, settings.language)}\n${newsletterCopy.highlights[index] || localizedSummary(item, settings.language)}\n${config.APP_URL}/item/${item.slug}`
        )
        .join('\n')}`
    });

    await prisma.newsletterDelivery.update({
      where: {
        id: delivery.id
      },
      data: {
        status: 'sent',
        providerMessageId: 'id' in result && typeof result.id === 'string' ? result.id : null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email failure.';
    await Promise.all([
      prisma.newsletterDelivery.update({
        where: {
          id: delivery.id
        },
        data: {
          status: 'failed'
        }
      }),
      recordSystemError('email', 'error', `Newsletter delivery for ${user.username} failed: ${message}`)
    ]);
  }

  return {
    ok: true,
    username: user.username,
    cadence,
    subjectLine,
    articleTitles: rankedItems.map((item) => localizedTitle(item, settings.language))
  };
}
