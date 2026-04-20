import { createHash, randomUUID } from 'node:crypto';

import type { Queue } from 'bullmq';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { AudienceLabel, InterfaceLanguage, ModerationFlag, SubjectTag } from '@edu-feed/shared';
import { DEMO_AI_CONFIG } from '@edu-feed/shared';
import Parser from 'rss-parser';
import { Resend } from 'resend';

import { getWorkerConfig } from '../config';
import type { AiEnrichmentJobPayload, IngestionJobPayload, NewsletterJobPayload } from './types';

const config = getWorkerConfig();
const prisma = new PrismaClient();
const parser = new Parser();
const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

type SchedulerQueues = {
  ingestion: Queue<IngestionJobPayload>;
  newsletter: Queue<NewsletterJobPayload>;
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
  }>;
  tags: Array<{
    label: string;
    type: 'subject' | 'audience' | 'flag' | 'meta';
    value: string;
  }>;
  promptText: string;
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

function sha1(value: string) {
  return createHash('sha1').update(value).digest('hex');
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.trim().split(/\s+/).filter(Boolean).length * 1.3));
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

function normalizeUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
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

function extractMediaUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return normalizeUrl(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractMediaUrl(entry);
      if (nested) return nested;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.url === 'string') return normalizeUrl(record.url);
    if (typeof record.href === 'string') return normalizeUrl(record.href);
    if (record.$ && typeof record.$ === 'object') {
      const nested = record.$ as Record<string, unknown>;
      if (typeof nested.url === 'string') return normalizeUrl(nested.url);
      if (typeof nested.href === 'string') return normalizeUrl(nested.href);
    }
  }
  return null;
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
    slug: `${sharedSlug}-${language}`
  });

  return sourceLanguage === 'bg'
    ? [makeRecord('bg'), makeRecord('en')]
    : [makeRecord('en'), makeRecord('bg')];
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

function isEligibleForMode(item: NewsletterItemRecord, mode: 'kid' | 'standard' | 'adult') {
  const flags = item.tags.filter((tag) => tag.type === 'flag').map((tag) => tag.value);
  if (mode === 'adult') {
    return true;
  }
  if (mode === 'standard') {
    return item.audience !== 'adult_only';
  }
  if (item.audience !== 'kid_safe') {
    return false;
  }
  return !flags.some((flag) => ['nsfw', 'gore', 'spoiler'].includes(flag));
}

function localizedTitle(item: NewsletterItemRecord, language: InterfaceLanguage) {
  return item.translations.find((translation) => translation.language === language)?.title || item.originalTitle;
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
    monthlyBudgetUsd: Number(stored.monthlyBudgetUsd),
    perJobBudgetUsd: Number(stored.perJobBudgetUsd),
    autoDowngrade: stored.autoDowngrade,
    pauseOnBudgetExceeded: stored.pauseOnBudgetExceeded
  };
}

async function recordAiUsage(input: {
  itemId?: string;
  userId?: string;
  purpose: 'summary' | 'translation' | 'classification' | 'newsletter';
  model: string;
  provider: string;
  prompt: string;
  output: string;
}) {
  await prisma.aiUsageLedger.create({
    data: {
      itemId: input.itemId || null,
      userId: input.userId || null,
      provider: input.provider,
      model: input.model,
      purpose: input.purpose,
      inputTokens: estimateTokens(input.prompt),
      outputTokens: estimateTokens(input.output),
      totalCostUsd: 0
    }
  });
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
  const response = await fetch(feed.feedUrl, {
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

  const xml = await response.text();
  const parsed = await parser.parseString(xml);

  await prisma.sourceFeed.update({
    where: {
      id: feed.id
    },
    data: {
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      lastCheckedAt: new Date(),
      lastError: null
    }
  });

  return parsed.items as ParsedFeedItem[];
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
  const coverImageUrl =
    extractMediaUrl(entry.enclosure) ||
    extractMediaUrl(entry['media:thumbnail']) ||
    extractMediaUrl(entry['media:content']) ||
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

async function persistContentItem(sourceFeed: SourceFeedRecord, input: IngestedItem) {
  const aiConfig = await getAiConfig();
  const existing = await prisma.contentItem.findUnique({
    where: {
      dedupeKey: input.dedupeKey
    },
    select: {
      id: true,
      slug: true
    }
  });

  const item = await prisma.contentItem.upsert({
    where: {
      dedupeKey: input.dedupeKey
    },
    create: {
      id: `item-${randomUUID()}`,
      slug: input.slug,
      dedupeKey: input.dedupeKey,
      kind: input.kind,
      sourceId: sourceFeed.source.id,
      publishedAt: input.publishedAt,
      originalTitle: input.originalTitle,
      originalSummary: input.originalSummary,
      bodyMarkdown: input.bodyMarkdown,
      coverImageUrl: input.coverImageUrl,
      externalUrl: input.externalUrl,
      youtubeVideoId: input.youtubeVideoId,
      subject: input.subject,
      audience: input.audience,
      translations: {
        create: input.translations
      },
      tags: {
        create: input.tags
      }
    },
    update: {
      kind: input.kind,
      publishedAt: input.publishedAt,
      originalTitle: input.originalTitle,
      originalSummary: input.originalSummary,
      bodyMarkdown: input.bodyMarkdown,
      coverImageUrl: input.coverImageUrl,
      externalUrl: input.externalUrl,
      youtubeVideoId: input.youtubeVideoId,
      subject: input.subject,
      audience: input.audience,
      translations: {
        deleteMany: {},
        create: input.translations
      },
      tags: {
        deleteMany: {},
        create: input.tags
      }
    },
    select: {
      id: true
    }
  });

  await Promise.all([
    recordAiUsage({
      itemId: item.id,
      purpose: 'summary',
      model: aiConfig.summaryModel,
      provider: aiConfig.provider,
      prompt: input.promptText,
      output: input.originalSummary
    }),
    recordAiUsage({
      itemId: item.id,
      purpose: 'translation',
      model: aiConfig.translationModel,
      provider: aiConfig.provider,
      prompt: input.originalTitle,
      output: input.translations.map((translation) => `${translation.language}:${translation.title}`).join(' | ')
    }),
    recordAiUsage({
      itemId: item.id,
      purpose: 'classification',
      model: aiConfig.translationModel,
      provider: aiConfig.provider,
      prompt: input.promptText,
      output: input.tags.map((tag) => `${tag.type}:${tag.value}`).join(', ')
    })
  ]);

  return {
    created: !existing,
    itemId: item.id
  };
}

async function refreshItemMetadata(itemId: string) {
  const item = await prisma.contentItem.findUnique({
    where: {
      id: itemId
    },
    include: {
      source: true
    }
  });
  if (!item) {
    throw new Error('Item not found.');
  }

  const sourceSubjects = parseSourceSubjects(item.source);
  const promptText = `${item.originalTitle} ${item.originalSummary} ${item.bodyMarkdown || ''}`.trim();
  const summary = takeParagraph(item.bodyMarkdown || item.originalSummary, item.originalSummary);
  const subject = detectSubject(sourceSubjects, promptText, item.kind === 'youtube_video' ? 'youtube' : 'rss');
  const flags = detectFlags(promptText, item.source.sourceType);
  const audience = detectAudience(item.source.defaultAudience, flags, item.source.sourceType);
  const translations = buildTranslationRecords(item.source.language, item.originalTitle, summary, item.slug);
  const tags = buildTagRecords(subject, audience, flags, item.kind === 'youtube_video' ? 'youtube' : 'rss');
  const aiConfig = await getAiConfig();

  await prisma.contentItem.update({
    where: {
      id: itemId
    },
    data: {
      originalSummary: summary,
      subject,
      audience,
      translations: {
        deleteMany: {},
        create: translations
      },
      tags: {
        deleteMany: {},
        create: tags
      }
    }
  });

  await Promise.all([
    recordAiUsage({
      itemId,
      purpose: 'summary',
      model: aiConfig.summaryModel,
      provider: aiConfig.provider,
      prompt: promptText,
      output: summary
    }),
    recordAiUsage({
      itemId,
      purpose: 'translation',
      model: aiConfig.translationModel,
      provider: aiConfig.provider,
      prompt: item.originalTitle,
      output: translations.map((translation) => `${translation.language}:${translation.title}`).join(' | ')
    }),
    recordAiUsage({
      itemId,
      purpose: 'classification',
      model: aiConfig.translationModel,
      provider: aiConfig.provider,
      prompt: promptText,
      output: tags.map((tag) => `${tag.type}:${tag.value}`).join(', ')
    })
  ]);
}

async function selectNewsletterItems(user: NewsletterUserRecord, cadence: 'daily' | 'weekly') {
  const [hidden, delivered, saved] = await Promise.all([
    prisma.hiddenItem.findMany({
      where: {
        userId: user.id
      },
      select: {
        itemId: true
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
            subject: true
          }
        }
      }
    })
  ]);

  const hiddenIds = new Set(hidden.map((entry) => entry.itemId));
  const deliveredIds = new Set(delivered.map((entry) => entry.itemId));
  const subjectWeights = new Map<string, number>();

  for (const save of saved) {
    const nextCount = (subjectWeights.get(save.item.subject) || 0) + 1;
    subjectWeights.set(save.item.subject, nextCount);
  }

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

  return items
    .filter((item) => !hiddenIds.has(item.id) && !deliveredIds.has(item.id))
    .filter((item) => isEligibleForMode(item, user.settings?.contentMode || 'standard'))
    .sort((left, right) => {
      const leftWeight = subjectWeights.get(left.subject) || 0;
      const rightWeight = subjectWeights.get(right.subject) || 0;
      if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
      }
      return right.publishedAt.getTime() - left.publishedAt.getTime();
    })
    .slice(0, cadence === 'daily' ? 3 : 5);
}

export async function bootstrapRecurringJobs(queues: SchedulerQueues) {
  const [feeds, users] = await Promise.all([
    prisma.sourceFeed.findMany({
      where: {
        source: {
          status: 'active'
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

  await Promise.all(
    feeds.map((feed) =>
      queues.ingestion.add(
        `source:${feed.sourceId}`,
        {
          sourceId: feed.sourceId,
          feedUrl: feed.feedUrl
        },
        {
          jobId: `source:${feed.sourceId}`,
          repeat: {
            every: Math.max(feed.pollIntervalSec, 60) * 1000
          },
          removeOnComplete: true,
          removeOnFail: 50
        }
      )
    )
  );

  await Promise.all(
    users.map((user) =>
      queues.newsletter.add(
        `newsletter:${user.username}:weekly`,
        {
          username: user.username,
          mode: 'weekly'
        },
        {
          jobId: `newsletter:${user.username}:weekly`,
          repeat: {
            every: 7 * 24 * 60 * 60 * 1000
          },
          removeOnComplete: true,
          removeOnFail: 50
        }
      )
    )
  );
}

export async function shutdownProcessorServices() {
  await prisma.$disconnect();
}

export async function processIngestionJob(payload: IngestionJobPayload) {
  const sourceFeed = await loadSourceFeed(payload);
  if (!sourceFeed) {
    throw new Error(`Source feed not found for ${payload.sourceId || payload.feedUrl}`);
  }

  try {
    const items = await fetchFeed(sourceFeed);
    if (!items) {
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

    for (const entry of items.slice(0, 20)) {
      const derived = deriveFeedItem(sourceFeed, entry);
      if (!derived) continue;
      discoveredItems += 1;
      const result = await persistContentItem(sourceFeed, derived);
      if (result.created) {
        createdItems += 1;
      } else {
        updatedItems += 1;
      }
    }

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
      discoveredItems,
      createdItems,
      updatedItems,
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
    throw error;
  }
}

export async function processAiEnrichmentJob(payload: AiEnrichmentJobPayload) {
  await refreshItemMetadata(payload.itemId);
  return {
    ok: true,
    itemId: payload.itemId,
    completedTasks: payload.tasks
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
  const rankedItems = await selectNewsletterItems(user, cadence);

  if (!rankedItems.length) {
    await prisma.newsletterDelivery.create({
      data: {
        userId: user.id,
        cadence,
        status: 'skipped',
        subjectLine,
        summaryText: 'No new eligible articles were available for this digest.'
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

  const summaryText = rankedItems
    .map((item, index) => `${index + 1}. ${localizedTitle(item, settings.language)}`)
    .join('\n');

  const delivery = await prisma.newsletterDelivery.create({
    data: {
      userId: user.id,
      cadence,
      status: config.ENABLE_EMAIL && resend ? 'queued' : 'skipped',
      subjectLine,
      summaryText,
      items: {
        create: rankedItems.map((item, index) => ({
          itemId: item.id,
          position: index
        }))
      }
    }
  });

  await recordAiUsage({
    userId: user.id,
    purpose: 'newsletter',
    model: aiConfig.newsletterModel,
    provider: aiConfig.provider,
    prompt: `${user.username}:${cadence}`,
    output: summaryText
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
      <h1>${subjectLine}</h1>
      <p>Here are a few educational pieces you may have missed.</p>
      <ol>
        ${rankedItems
          .map(
            (item) =>
              `<li><a href="${config.APP_URL}/item/${item.slug}">${localizedTitle(item, settings.language)}</a> <span style="color:#666;">from ${item.source.name}</span></li>`
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
      text: `${subjectLine}\n\n${rankedItems
        .map((item) => `- ${localizedTitle(item, settings.language)}: ${config.APP_URL}/item/${item.slug}`)
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
