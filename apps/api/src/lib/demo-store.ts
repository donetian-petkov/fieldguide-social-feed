import { randomUUID } from 'node:crypto';

import type {
  AdminAiCredentialStatus,
  AdminAiUsageBreakdown,
  AdminAiUsageSummary,
  AiModelConfig,
  AiUsageSnapshot,
  AlbumDto,
  CommentDto,
  ContentItem,
  ContentMode,
  ErrorLogDto,
  FeedQuery,
  FeedPageInfo,
  GeneratedStoryDraftDto,
  InterfaceLanguage,
  ModeSwitchResult,
  SourceDefinition,
  SubjectFeed,
  SubjectTag,
  SubmissionDto,
  UserRole,
  UserSettingsDto
} from '@edu-feed/shared';
import {
  DEMO_AI_CONFIG,
  DEMO_AI_USAGE,
  DEMO_ALBUMS,
  DEMO_COMMENTS,
  DEMO_ERROR_LOGS,
  DEMO_ITEMS,
  DEMO_PINNED_ITEMS,
  DEMO_SOURCES,
  DEMO_SUBMISSIONS,
  DEMO_USERS,
  filterItemsForFeed,
  resolveTranslation
} from '@edu-feed/shared';

import { estimateCostUsd, PRICING_TABLE_VERSION, resolveModelPricing } from './ai-runtime.js';
import { rankRelatedItems } from './related-items.js';
import type { AdminSnapshot, AlbumDetail, FeedResponse, PublicProfile, RegisterInput } from './store.js';

type DemoSession = {
  username: string;
  expiresAt: number;
};

type ResetTokenRecord = {
  username: string;
  expiresAt: number;
};

type ModeVerificationRecord = {
  verifiedUntil: number;
};

type ProviderApiKey = AiModelConfig['provider'];

function emptyRuntimeAiKeys() {
  return {
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    OPENROUTER_API_KEY: '',
    OLLAMA_BASE_URL: ''
  };
}

function providerKeyField(provider: ProviderApiKey): keyof ReturnType<typeof emptyRuntimeAiKeys> {
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (provider === 'openrouter') return 'OPENROUTER_API_KEY';
  if (provider === 'ollama') return 'OLLAMA_BASE_URL';
  return 'OPENAI_API_KEY';
}

const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

function subjectToFeed(subject: ContentItem['subject']): SubjectFeed {
  if (subject === 'country_knowledge') return 'country-knowledge';
  if (subject === 'video') return 'videos';
  return subject;
}

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isAppLocalUrl(candidateUrl: string, appUrl: string) {
  try {
    const candidate = new URL(candidateUrl);
    const app = new URL(appUrl);
    if (candidate.origin === app.origin) return true;
    return candidate.port === app.port && isLoopbackHost(candidate.hostname) && isLoopbackHost(app.hostname);
  } catch {
    return false;
  }
}

function normalizeExternalUrl(candidateUrl: string | null | undefined, appUrl: string) {
  if (!candidateUrl?.trim()) return null;
  const normalized = candidateUrl.trim();
  return isAppLocalUrl(normalized, appUrl) ? null : normalized;
}

function buildAiUsageSummary(entries: AiUsageSnapshot[], startsAt: Date): AdminAiUsageSummary {
  const grouped = new Map<string, {
    provider: AiUsageSnapshot['provider'];
    inputTokens: number;
    outputTokens: number;
    recordedCostUsd: number;
  }>();

  for (const entry of entries) {
    const key = `${entry.provider}::${entry.model}`;
    const current = grouped.get(key) || {
      provider: entry.provider,
      inputTokens: 0,
      outputTokens: 0,
      recordedCostUsd: 0
    };
    current.inputTokens += entry.inputTokens;
    current.outputTokens += entry.outputTokens;
    current.recordedCostUsd += entry.totalCostUsd;
    grouped.set(key, current);
  }

  const lineItems = [...grouped.entries()]
    .map(([groupKey, totals]) => {
      const model = groupKey.slice(groupKey.indexOf('::') + 2);
      const pricing = resolveModelPricing(model, totals.provider);
      return {
        provider: totals.provider,
        model,
        pricedAsModel: pricing.canonicalModel,
        exactModelMatch: pricing.exact,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        totalCostUsd: estimateCostUsd(totals.provider, model, totals.inputTokens, totals.outputTokens),
        recordedCostUsd: Number(totals.recordedCostUsd.toFixed(6))
      };
    })
    .sort(
      (left, right) =>
        right.totalCostUsd - left.totalCostUsd ||
        left.provider.localeCompare(right.provider) ||
        left.model.localeCompare(right.model)
    );

  const inputTokens = lineItems.reduce((sum, entry) => sum + entry.inputTokens, 0);
  const outputTokens = lineItems.reduce((sum, entry) => sum + entry.outputTokens, 0);
  const totalCostUsd = Number(lineItems.reduce((sum, entry) => sum + entry.totalCostUsd, 0).toFixed(6));
  const recordedCostUsd = Number(lineItems.reduce((sum, entry) => sum + entry.recordedCostUsd, 0).toFixed(6));
  const fallbackModels = [
    ...new Set(
      lineItems.filter((entry) => !entry.exactModelMatch).map((entry) => `${entry.provider}:${entry.model}`)
    )
  ];
  const exactMatchCount = lineItems.filter((entry) => entry.exactModelMatch).length;
  const pricingConfidence =
    lineItems.length === 0 || exactMatchCount === lineItems.length
      ? 'exact'
      : exactMatchCount === 0
        ? 'fallback'
        : 'mixed';

  return {
    window: 'monthly',
    startsAt: startsAt.toISOString(),
    inputTokens,
    outputTokens,
    totalCostUsd,
    recordedCostUsd,
    estimated: true,
    pricingBasis: 'static_model_pricing',
    pricingTableVersion: PRICING_TABLE_VERSION,
    pricingConfidence,
    fallbackModels,
    usesProviderReportedCost: false,
    lineItems: lineItems.map(({ recordedCostUsd: _recordedCostUsd, ...entry }) => entry)
  };
}

function usagePurposeLabel(purpose: AiUsageSnapshot['purpose']) {
  if (purpose === 'generated_story') return 'Generated stories';
  if (purpose === 'generated_story_verification') return 'Story verification';
  return purpose.charAt(0).toUpperCase() + purpose.slice(1).replace(/_/g, ' ');
}

function buildAiUsageBreakdown(entries: AiUsageSnapshot[], startsAt: Date): AdminAiUsageBreakdown {
  const totals = buildAiUsageSummary(entries, startsAt);
  const byDay = new Map<string, { inputTokens: number; outputTokens: number; totalCostUsd: number }>();
  const byPurpose = new Map<AiUsageSnapshot['purpose'], { inputTokens: number; outputTokens: number; totalCostUsd: number }>();

  for (const entry of entries) {
    const day = entry.createdAt.slice(0, 10);
    const dayTotals = byDay.get(day) || { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 };
    dayTotals.inputTokens += entry.inputTokens;
    dayTotals.outputTokens += entry.outputTokens;
    dayTotals.totalCostUsd += entry.totalCostUsd;
    byDay.set(day, dayTotals);

    const purposeTotals = byPurpose.get(entry.purpose) || { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 };
    purposeTotals.inputTokens += entry.inputTokens;
    purposeTotals.outputTokens += entry.outputTokens;
    purposeTotals.totalCostUsd += entry.totalCostUsd;
    byPurpose.set(entry.purpose, purposeTotals);
  }

  return {
    window: 'monthly',
    startsAt: startsAt.toISOString(),
    totals,
    byDay: [...byDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, totalsForDay]) => ({
        date,
        label: date.slice(5),
        inputTokens: totalsForDay.inputTokens,
        outputTokens: totalsForDay.outputTokens,
        totalCostUsd: Number(totalsForDay.totalCostUsd.toFixed(6))
      })),
    byPurpose: [...byPurpose.entries()]
      .map(([purpose, totalsForPurpose]) => ({
        purpose,
        label: usagePurposeLabel(purpose),
        inputTokens: totalsForPurpose.inputTokens,
        outputTokens: totalsForPurpose.outputTokens,
        totalCostUsd: Number(totalsForPurpose.totalCostUsd.toFixed(6))
      }))
      .sort((left, right) => right.totalCostUsd - left.totalCostUsd || left.label.localeCompare(right.label)),
    byModel: totals.lineItems
  };
}

export class DemoStore {
  private readonly sessionTtlMs: number;

  private readonly modeSwitchTtlMs: number;

  private readonly appUrl: string;

  private sources = structuredClone(DEMO_SOURCES);

  private items = structuredClone(DEMO_ITEMS);

  private comments = structuredClone(DEMO_COMMENTS);

  private albums = structuredClone(DEMO_ALBUMS);

  private submissions = structuredClone(DEMO_SUBMISSIONS);

  private pinnedSlots = structuredClone(DEMO_PINNED_ITEMS);

  private errorLogs = structuredClone(DEMO_ERROR_LOGS);

  private aiConfig = structuredClone(DEMO_AI_CONFIG);

  private aiUsage = structuredClone(DEMO_AI_USAGE);

  private users = structuredClone(DEMO_USERS);

  private readonly envAiKeys: {
    OPENAI_API_KEY: string;
    ANTHROPIC_API_KEY: string;
    OPENROUTER_API_KEY: string;
    OLLAMA_BASE_URL: string;
  };

  private storedAiKeys = emptyRuntimeAiKeys();

  private generatedStories: GeneratedStoryDraftDto[] = [];

  private sessions = new Map<string, DemoSession>();

  private resetTokens = new Map<string, ResetTokenRecord>();

  private modeVerifications = new Map<string, ModeVerificationRecord>();

  private savedByUser = new Map<string, Set<string>>([
    ['alex', new Set(['item-sutton-hoo', 'item-book-riot', 'item-bulgaria'])],
    ['admin', new Set(['item-vermeer', 'item-nature'])]
  ]);

  private savedAtByUser = new Map<string, Map<string, string>>();

  private userJoinedAt = new Map<string, string>([
    ['alex', '2026-01-12T10:00:00.000Z'],
    ['admin', '2026-01-01T08:00:00.000Z'],
    ['mila', '2026-02-03T09:30:00.000Z']
  ]);

  private hiddenByUser = new Map<string, Set<string>>([
    ['alex', new Set()],
    ['admin', new Set()]
  ]);

  private itemViewsByUser = new Map<string, Map<string, number>>([
    ['alex', new Map([['item-sutton-hoo', 2], ['item-vermeer', 1]])],
    ['admin', new Map([['item-nature', 1]])]
  ]);

  private removedItemIds = new Set<string>();

  private credentials = new Map<string, string>([
    ['alex', 'fieldguide123'],
    ['admin', 'fieldguide123'],
    ['mila', 'fieldguide123']
  ]);

  private userEmails = new Map<string, string>([
    ['alex', 'alex@example.com'],
    ['admin', 'admin@example.com'],
    ['mila', 'mila@example.com']
  ]);

  constructor(options: {
    sessionTtlHours: number;
    modeSwitchTtlMinutes: number;
    appUrl: string;
    aiKeys?: Partial<{
      OPENAI_API_KEY: string;
      ANTHROPIC_API_KEY: string;
      OPENROUTER_API_KEY: string;
      OLLAMA_BASE_URL: string;
    }>;
  }) {
    this.sessionTtlMs = options.sessionTtlHours * 60 * 60 * 1000;
    this.modeSwitchTtlMs = options.modeSwitchTtlMinutes * 60 * 1000;
    this.appUrl = options.appUrl.replace(/\/$/, '');
    this.envAiKeys = {
      ...emptyRuntimeAiKeys(),
      ...options.aiKeys
    };

    if (!this.users.find((user) => user.username === 'mila')) {
      this.users.push({
        username: 'mila',
        displayName: 'Mila Petrova',
        role: 'user',
        language: 'bg',
        contentLanguageMode: 'dual',
        vibePreset: 'field_notes',
        fontFamily: '"Manrope", "Helvetica Neue", sans-serif',
        fontScale: 'md',
        imageMode: 'on',
        themeMode: 'light',
        contentMode: 'standard',
        newsletterEnabled: false,
        newsletterCadence: 'weekly',
        askAiEnabled: true,
        protectedModeEnabled: true
      });
    }
    for (const [username, savedIds] of this.savedByUser.entries()) {
      const timestamps = new Map<string, string>();
      let index = 0;
      for (const itemId of savedIds.values()) {
        const item = this.items.find((entry) => entry.id === itemId);
        const fallback = new Date(Date.now() - (savedIds.size - index) * 60 * 1000).toISOString();
        timestamps.set(itemId, item?.publishedAt || fallback);
        index += 1;
      }
      this.savedAtByUser.set(username, timestamps);
    }
  }

  listSources() {
    return this.sources;
  }

  getCurrentUser(sessionId?: string | null) {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return this.users.find((user) => user.username === session.username) || null;
  }

  register(input: RegisterInput) {
    const username = input.username.trim().toLowerCase();
    if (this.users.some((user) => user.username === username)) {
      throw new Error('Username is already taken.');
    }
    const nextUser: UserSettingsDto = {
      username,
      displayName: input.displayName.trim() || input.username.trim(),
      role: 'user',
      language: 'en',
      contentLanguageMode: 'single',
      vibePreset: 'museum',
      fontFamily: '"Fraunces", "Georgia", serif',
      fontScale: 'md',
      imageMode: 'on',
      themeMode: 'light',
      contentMode: 'standard',
      newsletterEnabled: false,
      newsletterCadence: 'weekly',
      askAiEnabled: true,
      protectedModeEnabled: true
    };
    this.users.push(nextUser);
    this.credentials.set(username, input.password);
    this.userEmails.set(username, `${username}@example.com`);
    this.savedByUser.set(username, new Set());
    this.savedAtByUser.set(username, new Map());
    this.hiddenByUser.set(username, new Set());
    this.itemViewsByUser.set(username, new Map());
    this.userJoinedAt.set(username, new Date().toISOString());
    const sessionId = this.createSession(username);
    return {
      sessionId,
      user: nextUser
    };
  }

  login(username: string, password: string) {
    const normalized = username.trim().toLowerCase();
    if (this.credentials.get(normalized) !== password) {
      throw new Error('Invalid username or password.');
    }
    const user = this.users.find((entry) => entry.username === normalized);
    if (!user) {
      throw new Error('Account does not exist.');
    }
    const sessionId = this.createSession(user.username);
    return {
      sessionId,
      user
    };
  }

  logout(sessionId?: string | null) {
    if (!sessionId) return;
    this.sessions.delete(sessionId);
  }

  verifyPassword(username: string, password: string) {
    const normalized = username.trim().toLowerCase();
    if (this.credentials.get(normalized) !== password) {
      throw new Error('Invalid password.');
    }
    const verifiedUntil = Date.now() + this.modeSwitchTtlMs;
    this.modeVerifications.set(normalized, { verifiedUntil });
    return new Date(verifiedUntil).toISOString();
  }

  switchContentMode(username: string, nextMode: ContentMode, password?: string | null): ModeSwitchResult {
    const user = this.requireUser(username);
    const currentMode = user.contentMode;
    const movingIntoOrOutOfProtectedMode = currentMode !== 'standard' || nextMode !== 'standard';

    if (movingIntoOrOutOfProtectedMode) {
      if (password?.trim()) {
        this.verifyPassword(username, password);
      } else {
        const record = this.modeVerifications.get(user.username);
        if (!record || record.verifiedUntil < Date.now()) {
          throw new Error('Password verification is required before switching this mode.');
        }
      }
    }

    user.contentMode = nextMode;
    this.errorLogs = this.errorLogs.filter((entry) => entry.id !== 'log-mode-switch');
    return {
      ok: true,
      nextMode,
      verifiedUntil: new Date(Date.now() + this.modeSwitchTtlMs).toISOString()
    };
  }

  forgotPassword(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    const exists = this.users.some((user) => user.username === normalized) || [...this.userEmails.values()].includes(normalized);
    if (!exists) {
      return { ok: true, previewToken: null };
    }
    const token = `reset_${randomUUID()}`;
    this.resetTokens.set(token, {
      username: this.resolveUsername(identifier),
      expiresAt: Date.now() + 60 * 60 * 1000
    });
    return {
      ok: true,
      previewToken: token
    };
  }

  resetPassword(token: string, nextPassword: string) {
    const record = this.resetTokens.get(token);
    if (!record || record.expiresAt < Date.now()) {
      throw new Error('Reset token is invalid or expired.');
    }
    this.credentials.set(record.username, nextPassword);
    this.resetTokens.delete(token);
    return { ok: true };
  }

  getSavedIds(username: string) {
    const saved = this.savedByUser.get(username) || new Set<string>();
    const savedAt = this.savedAtByUser.get(username) || new Map<string, string>();
    return [...saved].sort((left, right) => {
      const leftTs = new Date(savedAt.get(left) || 0).getTime();
      const rightTs = new Date(savedAt.get(right) || 0).getTime();
      return rightTs - leftTs;
    });
  }

  getFeed(query: FeedQuery, username?: string | null): FeedResponse {
    const viewer = username ? this.requireUser(username) : null;
    const mode = viewer?.contentMode || 'standard';
    const hiddenIds = viewer ? [...(this.hiddenByUser.get(viewer.username) || new Set())] : [];
    const savedIds = viewer ? [...(this.savedByUser.get(viewer.username) || new Set())] : [];

    let items =
      query.feed === 'saved'
        ? this.items.filter((item) => savedIds.includes(item.id))
        : filterItemsForFeed(this.items, query.feed, mode, hiddenIds);

    items = items.filter((item) => !this.removedItemIds.has(item.id));

    if (query.search?.trim()) {
      const lower = query.search.trim().toLowerCase();
      items = items.filter((item) => {
        const translation = resolveTranslation(item, query.language);
        return (
          translation?.title.toLowerCase().includes(lower) ||
          translation?.summary.toLowerCase().includes(lower) ||
          item.sourceName.toLowerCase().includes(lower)
        );
      });
    }

    if (query.feed === 'saved' && viewer) {
      const savedAt = this.savedAtByUser.get(viewer.username) || new Map<string, string>();
      items = items.sort((left, right) => {
        const leftTs = new Date(savedAt.get(left.id) || 0).getTime();
        const rightTs = new Date(savedAt.get(right.id) || 0).getTime();
        return rightTs - leftTs || +new Date(right.publishedAt) - +new Date(left.publishedAt);
      });
    } else {
      items = items.sort((left, right) => +new Date(right.publishedAt) - +new Date(left.publishedAt));
    }

    const pinnedIds = this.pinnedSlots.filter((entry) => entry.feed === query.feed).map((entry) => entry.itemId);
    const pinnedItems = items.filter((item) => pinnedIds.includes(item.id) || (item.pinned && query.feed !== 'saved'));
    const totalItems = items.length;
    const startIndex = (query.page - 1) * query.pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + query.pageSize);
    const commentCounts = this.getCommentCountsForItems([
      ...new Set([...paginatedItems.map((item) => item.id), ...pinnedItems.map((item) => item.id)])
    ]);

    return {
      items: paginatedItems,
      pinnedItems,
      savedIds,
      hiddenIds,
      commentCounts,
      mode,
      feed: query.feed,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        hasMore: startIndex + query.pageSize < totalItems
      }
    };
  }

  getItem(idOrSlug: string, username?: string | null) {
    const viewer = username ? this.requireUser(username) : null;
    const mode = viewer?.contentMode || 'standard';
    const item = this.items.find((entry) => entry.id === idOrSlug || entry.slug === idOrSlug) || null;
    if (!item) return null;
    if (this.removedItemIds.has(item.id)) return null;
    const allowed = filterItemsForFeed([item], 'saved', mode).length > 0;
    if (!allowed) return null;
    return item;
  }

  getRelatedItems(idOrSlug: string, username?: string | null) {
    const viewer = username ? this.requireUser(username) : null;
    const mode = viewer?.contentMode || 'standard';
    const hiddenIds = [...(this.hiddenByUser.get(username || '') || new Set<string>())];
    const item = this.items.find((entry) => entry.id === idOrSlug || entry.slug === idOrSlug) || null;
    if (!item) return [];

    const visibleCandidates = filterItemsForFeed(
      this.items.filter((entry) => entry.id !== item.id),
      'saved',
      mode,
      hiddenIds
    );
    const sourceSubjectsById = new Map(this.sources.map((source) => [source.id, source.subjects]));
    const ranked = rankRelatedItems(
      {
        item,
        sourceSubjects: sourceSubjectsById.get(item.sourceId) || item.subjects
      },
      visibleCandidates.map((candidate) => ({
        item: candidate,
        sourceSubjects: sourceSubjectsById.get(candidate.sourceId) || candidate.subjects
      }))
    );

    return ranked.slice(0, 4).map((candidate) => candidate.item);
  }

  recordItemView(username: string, itemId: string) {
    this.requireUser(username);
    const item = this.items.find((entry) => entry.id === itemId || entry.slug === itemId);
    if (!item) throw new Error('Item not found.');
    const views = this.itemViewsByUser.get(username) || new Map<string, number>();
    views.set(item.id, (views.get(item.id) || 0) + 1);
    this.itemViewsByUser.set(username, views);
    return { ok: true };
  }

  getProfile(username: string): PublicProfile | null {
    const user = this.users.find((entry) => entry.username === username);
    if (!user) return null;
    const items = this.items
      .filter((item) => item.authorUsername === username && !this.removedItemIds.has(item.id))
      .sort((left, right) => +new Date(right.publishedAt) - +new Date(left.publishedAt));
    const commentCounts = this.getCommentCountsForItems(items.map((item) => item.id));

    return {
      username: user.username,
      displayName: user.displayName,
      joinedAt: this.userJoinedAt.get(user.username) || new Date().toISOString(),
      stats: {
        itemsCount: items.length,
        commentsCount: this.comments.filter(
          (comment) => comment.authorUsername === username && !comment.deletedAt
        ).length,
        savedCount: (this.savedByUser.get(username) || new Set()).size,
        albumsCount: this.albums.filter((album) => album.ownerUsername === username).length
      },
      commentCounts,
      items
    };
  }

  listComments(itemId: string) {
    return this.comments
      .filter((comment) => comment.itemId === itemId && !comment.deletedAt)
      .sort((left, right) => +new Date(left.createdAt) - +new Date(right.createdAt));
  }

  addComment(username: string, itemId: string, body: string) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    if (item.commentsLocked) throw new Error('Comments are locked for this item.');
    const author = this.requireUser(username);
    const nextComment: CommentDto = {
      id: `comment-${randomUUID()}`,
      itemId,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      moderationNote: null
    };
    this.comments.push(nextComment);
    return nextComment;
  }

  hideItem(username: string, itemId: string) {
    const hidden = this.hiddenByUser.get(username) || new Set<string>();
    hidden.add(itemId);
    this.hiddenByUser.set(username, hidden);
    return {
      ok: true,
      hiddenIds: [...hidden]
    };
  }

  saveItem(username: string, itemId: string) {
    const saved = this.savedByUser.get(username) || new Set<string>();
    const savedAt = this.savedAtByUser.get(username) || new Map<string, string>();
    saved.add(itemId);
    savedAt.set(itemId, new Date().toISOString());
    this.savedByUser.set(username, saved);
    this.savedAtByUser.set(username, savedAt);
    return { ok: true, savedIds: this.getSavedIds(username) };
  }

  unsaveItem(username: string, itemId: string) {
    const saved = this.savedByUser.get(username) || new Set<string>();
    const savedAt = this.savedAtByUser.get(username) || new Map<string, string>();
    saved.delete(itemId);
    savedAt.delete(itemId);
    this.savedByUser.set(username, saved);
    this.savedAtByUser.set(username, savedAt);
    return { ok: true, savedIds: this.getSavedIds(username) };
  }

  getAlbums(username: string) {
    return this.albums.filter((album) => album.ownerUsername === username);
  }

  getAlbum(username: string, albumId: string) {
    const album = this.albums.find((entry) => entry.id === albumId && entry.ownerUsername === username) || null;
    if (!album) return null;
    return {
      album,
      items: album.itemIds
        .map((itemId) => this.items.find((entry) => entry.id === itemId))
        .filter(Boolean) as ContentItem[]
    } satisfies AlbumDetail;
  }

  createAlbum(username: string, title: string, description: string) {
    const nextAlbum: AlbumDto = {
      id: `album-${randomUUID()}`,
      ownerUsername: username,
      title,
      description,
      coverItemId: null,
      itemIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.albums.push(nextAlbum);
    return nextAlbum;
  }

  updateAlbum(
    username: string,
    albumId: string,
    patch: Partial<Pick<AlbumDto, 'title' | 'description' | 'coverItemId' | 'itemIds'>>
  ) {
    const album = this.albums.find((entry) => entry.id === albumId && entry.ownerUsername === username);
    if (!album) throw new Error('Album not found.');
    if (patch.itemIds) {
      const allowedIds = new Set(album.itemIds);
      if (new Set(patch.itemIds).size !== patch.itemIds.length) {
        throw new Error('Album item order cannot contain duplicates.');
      }
      if (patch.itemIds.some((itemId) => !allowedIds.has(itemId))) {
        throw new Error('Album order can only include existing album items.');
      }
      album.itemIds = [...patch.itemIds];
    }
    if (patch.coverItemId !== undefined) {
      if (patch.coverItemId && !album.itemIds.includes(patch.coverItemId)) {
        throw new Error('Cover item must belong to the album.');
      }
      album.coverItemId = patch.coverItemId;
    }
    if (patch.title !== undefined) album.title = patch.title;
    if (patch.description !== undefined) album.description = patch.description;
    if (!album.coverItemId && album.itemIds[0]) {
      album.coverItemId = album.itemIds[0];
    }
    if (album.coverItemId && !album.itemIds.includes(album.coverItemId)) {
      album.coverItemId = album.itemIds[0] || null;
    }
    album.updatedAt = new Date().toISOString();
    return album;
  }

  deleteAlbum(username: string, albumId: string) {
    const index = this.albums.findIndex((entry) => entry.id === albumId && entry.ownerUsername === username);
    if (index < 0) throw new Error('Album not found.');
    this.albums.splice(index, 1);
    return { ok: true as const };
  }

  addAlbumItem(username: string, albumId: string, itemId: string) {
    const album = this.albums.find((entry) => entry.id === albumId && entry.ownerUsername === username);
    if (!album) throw new Error('Album not found.');
    if (!album.itemIds.includes(itemId)) {
      album.itemIds.push(itemId);
    }
    if (!album.coverItemId) album.coverItemId = itemId;
    album.updatedAt = new Date().toISOString();
    return album;
  }

  createSubmission(username: string, input: { type: 'link' | 'community_post'; title: string; sourceUrl?: string | null; body?: string | null }) {
    const normalizedSourceUrl = normalizeExternalUrl(input.sourceUrl, this.appUrl);
    if (input.type === 'link' && !normalizedSourceUrl) {
      throw new Error('Community link submissions must point to an external source URL.');
    }
    const submission: SubmissionDto = {
      id: `submission-${randomUUID()}`,
      type: input.type,
      title: input.title,
      sourceUrl: normalizedSourceUrl,
      body: input.body || null,
      submittedBy: username,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    this.submissions.unshift(submission);
    return submission;
  }

  askAi(itemId: string, question: string, language: InterfaceLanguage, username?: string | null) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    const viewer = username ? this.requireUser(username) : null;
    if (viewer && !viewer.askAiEnabled) {
      throw new Error('Ask-AI is disabled in your settings.');
    }
    const translation = resolveTranslation(item, language);
    const modeLead =
      viewer?.contentMode === 'kid'
        ? language === 'bg'
          ? 'Ще запазя отговора детски, без графични или зрели подробности.'
          : 'I will keep the answer kid-safe, without graphic or mature detail.'
        : viewer?.contentMode === 'standard'
          ? language === 'bg'
            ? 'Ще остана на общообразователно ниво и ще избегна ненужни смущаващи подробности.'
            : 'I will keep the answer educational and avoid unnecessary disturbing detail.'
          : '';
    const answer =
      language === 'bg'
        ? `${modeLead} За "${translation?.title}" бих започнал с произхода на източника, ключовия аргумент и какви допълнителни първични или музейни материали можеш да потърсиш. Въпросът ти беше: ${question}`
        : `${modeLead} For "${translation?.title}", start with the source context, the central claim, and which museum, archive, or primary materials could deepen the story. Your question was: ${question}`;

    return {
      answer,
      citations: [item.externalUrl || `${this.appUrl}/item/${item.slug}`]
    };
  }

  shareItem(itemId: string) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    return {
      ok: true,
      shareUrl: `${this.appUrl}/item/${item.slug}`
    };
  }

  getAiConfig() {
    return this.aiConfig;
  }

  getAiRuntimeKeys() {
    return {
      OPENAI_API_KEY: this.storedAiKeys.OPENAI_API_KEY || this.envAiKeys.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: this.storedAiKeys.ANTHROPIC_API_KEY || this.envAiKeys.ANTHROPIC_API_KEY,
      OPENROUTER_API_KEY: this.storedAiKeys.OPENROUTER_API_KEY || this.envAiKeys.OPENROUTER_API_KEY,
      OLLAMA_BASE_URL: this.storedAiKeys.OLLAMA_BASE_URL || this.envAiKeys.OLLAMA_BASE_URL
    };
  }

  getAdminSnapshot(): AdminSnapshot {
    return {
      sources: this.sources,
      submissions: this.submissions,
      users: this.users,
      items: this.items,
      comments: this.comments,
      errorLogs: this.errorLogs,
      aiConfig: this.aiConfig,
      aiUsage: this.aiUsage,
      generatedStories: this.generatedStories
    };
  }

  getAdminAiUsageSummary(): AdminAiUsageSummary {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthlyUsage = this.aiUsage.filter((entry) => new Date(entry.createdAt) >= monthStart);
    return buildAiUsageSummary(monthlyUsage, monthStart);
  }

  getAdminAiUsageBreakdown(): AdminAiUsageBreakdown {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthlyUsage = this.aiUsage.filter((entry) => new Date(entry.createdAt) >= monthStart);
    return buildAiUsageBreakdown(monthlyUsage, monthStart);
  }

  getAdminAiCredentialStatus(): AdminAiCredentialStatus {
    const runtimeKeys = this.getAiRuntimeKeys();
    return {
      openai: {
        configured: Boolean(runtimeKeys.OPENAI_API_KEY),
        source: this.storedAiKeys.OPENAI_API_KEY ? 'database' : this.envAiKeys.OPENAI_API_KEY ? 'environment' : 'none'
      },
      anthropic: {
        configured: Boolean(runtimeKeys.ANTHROPIC_API_KEY),
        source: this.storedAiKeys.ANTHROPIC_API_KEY ? 'database' : this.envAiKeys.ANTHROPIC_API_KEY ? 'environment' : 'none'
      },
      openrouter: {
        configured: Boolean(runtimeKeys.OPENROUTER_API_KEY),
        source: this.storedAiKeys.OPENROUTER_API_KEY ? 'database' : this.envAiKeys.OPENROUTER_API_KEY ? 'environment' : 'none'
      },
      ollama: {
        configured: Boolean(runtimeKeys.OLLAMA_BASE_URL),
        source: this.storedAiKeys.OLLAMA_BASE_URL ? 'database' : this.envAiKeys.OLLAMA_BASE_URL ? 'environment' : 'none'
      }
    };
  }

  setAdminAiProviderKey(provider: ProviderApiKey, apiKey: string | null) {
    const field = providerKeyField(provider);
    this.storedAiKeys = {
      ...this.storedAiKeys,
      [field]: apiKey?.trim() || ''
    };
    return this.getAdminAiCredentialStatus();
  }

  listGeneratedStoryDrafts() {
    return this.generatedStories;
  }

  requestGeneratedStory(username: string, input: { subject: SubjectTag; prompt: string }) {
    this.requireUser(username);
    const sourceItems = this.items.filter((item) => item.subject === input.subject || item.subjects.includes(input.subject)).slice(0, 3);
    const citations = sourceItems.map((item) => ({
      title: item.originalTitle,
      url: item.externalUrl || `${this.appUrl}/item/${item.slug}`,
      sourceName: item.sourceName,
      publishedAt: item.publishedAt,
      excerpt: item.originalSummary
    }));
    const now = new Date().toISOString();
    const draft: GeneratedStoryDraftDto = {
      id: `generated-${randomUUID()}`,
      status: citations.length ? 'draft' : 'failed',
      subject: input.subject,
      prompt: input.prompt,
      requestedBy: username,
      reviewedBy: null,
      itemId: null,
      title: citations.length ? `Generated guide: ${input.prompt.slice(0, 72)}` : null,
      summary: citations.length
        ? `A verifier-ready educational draft based on ${citations.length} cited source items.`
        : null,
      bodyMarkdown: citations.length
        ? `This admin-only draft answers the request using only the cited source pack.\n\n${citations
            .map((citation) => `- ${citation.title}: ${citation.excerpt}`)
            .join('\n')}`
        : null,
      citations,
      verification: citations.length
        ? {
            passed: true,
            score: 0.92,
            notes: 'Demo verifier passed because every claim is sourced from demo citations.',
            unsupportedClaims: []
          }
        : null,
      failureReason: citations.length ? null : 'No source items were available for this subject.',
      totalCostUsd: citations.length ? 0.002 : 0,
      createdAt: now,
      updatedAt: now,
      generatedAt: citations.length ? now : null,
      reviewedAt: null
    };
    this.generatedStories.unshift(draft);
    return draft;
  }

  reviewGeneratedStory(username: string, draftId: string, decision: 'approved' | 'rejected') {
    this.requireUser(username);
    const draft = this.generatedStories.find((entry) => entry.id === draftId);
    if (!draft) throw new Error('Generated draft not found.');
    const now = new Date().toISOString();
    if (decision === 'rejected') {
      draft.status = 'rejected';
      draft.reviewedBy = username;
      draft.reviewedAt = now;
      draft.updatedAt = now;
      return {
        draft,
        item: null
      };
    }

    if (draft.status !== 'draft' || !draft.title || !draft.summary || !draft.bodyMarkdown || !draft.verification?.passed) {
      throw new Error('Only verified draft stories can be approved.');
    }

    let generatedSource = this.sources.find((entry) => entry.id === 'src-fieldguide-generated');
    if (!generatedSource) {
      generatedSource = {
        id: 'src-fieldguide-generated',
        name: 'Fieldguide Generated Guides',
        slug: 'fieldguide-generated-guides',
        iconUrl: `${this.appUrl}/generated-story-icon.png`,
        siteUrl: `${this.appUrl}/admin/ai`,
        feedUrl: `${this.appUrl}/generated-stories/feed.xml`,
        kind: 'custom',
        status: 'active',
        sourceType: 'editorial',
        subjects: ['history', 'art', 'books', 'movies', 'country_knowledge', 'photography', 'nature', 'video'],
        defaultAudience: 'standard_only',
        language: 'en',
        description: 'Admin-approved educational drafts generated from cited source material.'
      };
      this.sources.unshift(generatedSource);
    }

    const firstCitedItem = this.items.find((item) => item.externalUrl === draft.citations[0]?.url);
    const slugBase = draft.title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    const item: ContentItem = {
      id: `item-${randomUUID()}`,
      slug: `${slugBase || 'generated-story'}-${randomUUID().slice(0, 8)}`,
      kind: 'generated_story',
      sourceId: generatedSource.id,
      sourceName: generatedSource.name,
      sourceIconUrl: generatedSource.iconUrl,
      sourceUrl: generatedSource.siteUrl,
      authorUsername: draft.requestedBy,
      publishedAt: now,
      originalTitle: draft.title,
      originalSummary: draft.summary,
      coverImageUrl: firstCitedItem?.coverImageUrl || generatedSource.iconUrl,
      externalUrl: null,
      youtubeVideoId: null,
      subject: draft.subject,
      subjects: [draft.subject],
      flags: [],
      audience: 'standard_only',
      pinned: false,
      commentsLocked: false,
      hiddenByDefault: false,
      removedAt: null,
      translations: [
        {
          language: 'en',
          title: draft.title,
          summary: draft.summary,
          slug: `${slugBase || 'generated-story'}-en`
        },
        {
          language: 'bg',
          title: draft.title,
          summary: draft.summary,
          slug: `${slugBase || 'generated-story'}-bg`
        }
      ],
      tags: [
        { id: `tag-${randomUUID()}`, label: draft.subject.replace('_', ' '), type: 'subject', value: draft.subject },
        { id: `tag-${randomUUID()}`, label: 'Standard', type: 'audience', value: 'standard_only' },
        { id: `tag-${randomUUID()}`, label: 'AI Draft', type: 'meta', value: 'ai_generated' },
        { id: `tag-${randomUUID()}`, label: 'Cited Sources', type: 'meta', value: 'cited_sources' }
      ],
      bodyMarkdown: `${draft.bodyMarkdown}\n\n## Sources\n${draft.citations.map((citation) => `- [${citation.title}](${citation.url})`).join('\n')}`,
      ai: {
        summaryProvider: this.aiConfig.provider,
        summaryModel: this.aiConfig.summaryModel,
        translationProvider: this.aiConfig.provider,
        translationModel: this.aiConfig.translationModel
      }
    };
    this.items.unshift(item);
    draft.status = 'approved';
    draft.reviewedBy = username;
    draft.reviewedAt = now;
    draft.updatedAt = now;
    draft.itemId = item.id;
    return {
      draft,
      item
    };
  }

  addSource(source: Omit<SourceDefinition, 'id'>) {
    const id = `src-${randomUUID()}`;
    const nextSource: SourceDefinition = {
      ...source,
      id
    };
    this.sources.unshift(nextSource);
    return nextSource;
  }

  updateSource(sourceId: string, patch: Partial<Omit<SourceDefinition, 'id'>>) {
    const source = this.sources.find((entry) => entry.id === sourceId);
    if (!source) throw new Error('Source not found.');
    Object.assign(source, patch);
    return source;
  }

  deleteSource(sourceId: string) {
    const sourceIndex = this.sources.findIndex((entry) => entry.id === sourceId);
    if (sourceIndex < 0) throw new Error('Source not found.');

    const removedSource = this.sources[sourceIndex]!;
    this.sources.splice(sourceIndex, 1);

    const removedItemIds = this.items
      .filter((entry) => entry.sourceId === removedSource.id)
      .map((entry) => entry.id);
    const removedItemIdSet = new Set(removedItemIds);

    this.items = this.items.filter((entry) => entry.sourceId !== removedSource.id);
    this.comments = this.comments.filter((entry) => !removedItemIdSet.has(entry.itemId));
    this.pinnedSlots = this.pinnedSlots.filter((entry) => !removedItemIdSet.has(entry.itemId));

    this.albums = this.albums.map((album) => {
      const nextItemIds = album.itemIds.filter((itemId) => !removedItemIdSet.has(itemId));
      return {
        ...album,
        itemIds: nextItemIds,
        coverItemId: album.coverItemId && removedItemIdSet.has(album.coverItemId) ? nextItemIds[0] || null : album.coverItemId,
        updatedAt: new Date().toISOString()
      };
    });

    for (const saved of this.savedByUser.values()) {
      for (const itemId of removedItemIds) {
        saved.delete(itemId);
      }
    }
    for (const hidden of this.hiddenByUser.values()) {
      for (const itemId of removedItemIds) {
        hidden.delete(itemId);
      }
    }

    return { ok: true as const };
  }

  reviewSubmission(submissionId: string, decision: 'approved' | 'rejected') {
    const submission = this.submissions.find((entry) => entry.id === submissionId);
    if (!submission) throw new Error('Submission not found.');
    submission.status = decision;

    let item: ContentItem | null = null;
    if (decision === 'approved') {
      let communitySource = this.sources.find((entry) => entry.id === 'src-community-demo');
      if (!communitySource) {
        communitySource = {
          id: 'src-community-demo',
          name: 'Fieldguide Community',
          slug: 'community',
          iconUrl: `${this.appUrl}/community-icon.png`,
          siteUrl: `${this.appUrl}/community`,
          feedUrl: `${this.appUrl}/community/feed.xml`,
          kind: 'custom',
          status: 'active',
          sourceType: 'community',
          subjects: ['community'],
          defaultAudience: 'standard_only',
          language: 'en',
          description: 'Approved community submissions.'
        };
        this.sources.unshift(communitySource);
      }

      item =
        this.items.find(
          (entry) =>
            entry.kind === 'community_post' &&
            entry.originalTitle === submission.title &&
            entry.authorUsername === submission.submittedBy
        ) || null;

      if (!item) {
        const normalizedSourceUrl = normalizeExternalUrl(submission.sourceUrl, this.appUrl);
        item = {
          id: `item-${randomUUID()}`,
          slug: `${submission.title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}-${randomUUID().slice(0, 8)}`,
          kind: 'community_post',
          sourceId: communitySource.id,
          sourceName: communitySource.name,
          sourceIconUrl: communitySource.iconUrl,
          sourceUrl: communitySource.siteUrl,
          authorUsername: submission.submittedBy,
          publishedAt: new Date().toISOString(),
          originalTitle: submission.title,
          originalSummary:
            submission.body?.slice(0, 280) || `Approved community submission shared by ${submission.submittedBy}.`,
          coverImageUrl: communitySource.iconUrl,
          externalUrl: normalizedSourceUrl,
          youtubeVideoId: null,
          subject: 'community',
          subjects: ['community'],
          flags: ['not_verified'],
          audience: 'standard_only',
          pinned: false,
          commentsLocked: false,
          hiddenByDefault: false,
          removedAt: null,
          translations: [
            {
              language: 'en',
              title: submission.title,
              summary: submission.body?.slice(0, 280) || `Approved community submission shared by ${submission.submittedBy}.`,
              slug: `${submission.title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}-en`
            },
            {
              language: 'bg',
              title: submission.title,
              summary: submission.body?.slice(0, 280) || `Approved community submission shared by ${submission.submittedBy}.`,
              slug: `${submission.title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}-bg`
            }
          ],
          tags: [
            { id: `tag-${randomUUID()}`, label: 'Community', type: 'subject', value: 'community' },
            { id: `tag-${randomUUID()}`, label: 'Not Verified', type: 'flag', value: 'not_verified' },
            { id: `tag-${randomUUID()}`, label: 'Standard', type: 'audience', value: 'standard_only' }
          ],
          bodyMarkdown: submission.body,
          ai: {
            summaryProvider: this.aiConfig.provider,
            summaryModel: this.aiConfig.summaryModel,
            translationProvider: this.aiConfig.provider,
            translationModel: this.aiConfig.translationModel
          }
        };
        this.items.unshift(item);
      }
    }

    return {
      submission,
      item
    };
  }

  updateComment(username: string, commentId: string, body: string) {
    const comment = this.comments.find((entry) => entry.id === commentId && !entry.deletedAt);
    if (!comment) throw new Error('Comment not found.');
    if (comment.authorUsername !== username) throw new Error('You can only edit your own comments.');
    if (Date.now() - new Date(comment.createdAt).getTime() > COMMENT_EDIT_WINDOW_MS) {
      throw new Error('The comment edit window has expired.');
    }
    comment.body = body;
    comment.editedAt = new Date().toISOString();
    return comment;
  }

  deleteComment(commentId: string, moderationNote?: string) {
    const comment = this.comments.find((entry) => entry.id === commentId);
    if (!comment) throw new Error('Comment not found.');
    comment.deletedAt = new Date().toISOString();
    comment.moderationNote = moderationNote || 'Deleted by admin.';
    return comment;
  }

  patchItem(
    itemId: string,
    patch: Partial<Pick<ContentItem, 'audience' | 'commentsLocked' | 'flags' | 'hiddenByDefault' | 'pinned'>>
  ) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    Object.assign(item, patch);
    if (patch.pinned === false) {
      this.pinnedSlots = this.pinnedSlots.filter((entry) => entry.itemId !== itemId);
    }
    return item;
  }

  removeItem(itemId: string, removed: boolean) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    item.removedAt = removed ? new Date().toISOString() : null;
    if (removed) {
      this.removedItemIds.add(itemId);
      item.pinned = false;
      this.pinnedSlots = this.pinnedSlots.filter((entry) => entry.itemId !== itemId);
    } else {
      this.removedItemIds.delete(itemId);
    }
    return item;
  }

  pinItem(itemId: string, slot: number) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    const feed = subjectToFeed(item.subject);
    item.pinned = true;
    const existingSlot = this.pinnedSlots.find((entry) => entry.feed === feed && entry.slot === slot);
    if (existingSlot) {
      existingSlot.itemId = itemId;
    } else {
      this.pinnedSlots.push({
        feed,
        slot,
        itemId
      });
    }
    return item;
  }

  lockComments(itemId: string, locked: boolean) {
    return this.patchItem(itemId, { commentsLocked: locked });
  }

  suspendUser(username: string, suspended: boolean) {
    const user = this.requireUser(username);
    user.protectedModeEnabled = !suspended;
    if (suspended) {
      this.errorLogs.unshift({
        id: `log-${randomUUID()}`,
        scope: 'api',
        message: `User ${username} was suspended by admin action.`,
        level: 'warn',
        createdAt: new Date().toISOString(),
        resolvedAt: null
      });
    }
    return user;
  }

  setUserRole(username: string, role: UserRole) {
    const user = this.requireUser(username);
    if (user.role === role) return user;
    if (user.role === 'admin' && role !== 'admin' && this.users.filter((entry) => entry.role === 'admin').length <= 1) {
      throw new Error('At least one admin account must remain.');
    }
    user.role = role;
    return user;
  }

  updateAiConfig(patch: Partial<AiModelConfig>) {
    this.aiConfig = {
      ...this.aiConfig,
      ...patch
    };
    return this.aiConfig;
  }

  updateUserSettings(username: string, patch: Partial<UserSettingsDto>) {
    const user = this.requireUser(username);
    Object.assign(user, patch);
    return user;
  }

  private getCommentCountsForItems(itemIds: string[]) {
    const counts: Record<string, number> = {};
    const itemSet = new Set(itemIds);
    for (const comment of this.comments) {
      if (comment.deletedAt || !itemSet.has(comment.itemId)) continue;
      counts[comment.itemId] = (counts[comment.itemId] || 0) + 1;
    }
    return counts;
  }

  private createSession(username: string) {
    const token = `sess_${randomUUID()}`;
    this.sessions.set(token, {
      username,
      expiresAt: Date.now() + this.sessionTtlMs
    });
    return token;
  }

  private resolveUsername(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    const direct = this.users.find((user) => user.username === normalized);
    if (direct) return direct.username;
    for (const [username, email] of this.userEmails.entries()) {
      if (email === normalized) return username;
    }
    return normalized;
  }

  private requireUser(username: string) {
    const user = this.users.find((entry) => entry.username === username);
    if (!user) throw new Error('Account not found.');
    return user;
  }
}
