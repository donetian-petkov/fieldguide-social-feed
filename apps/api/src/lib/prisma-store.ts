import { createHash, randomUUID } from 'node:crypto';

import argon2 from 'argon2';
import { PrismaClient, type Prisma } from '@prisma/client';
import type {
  AiModelConfig,
  AiUsageSnapshot,
  AlbumDto,
  CommentDto,
  ContentItem,
  ContentMode,
  ContentTag,
  FeedQuery,
  GeneratedStoryCitation,
  GeneratedStoryDraftDto,
  GeneratedStoryVerification,
  InterfaceLanguage,
  ModerationFlag,
  SourceDefinition,
  SubmissionDto,
  SubjectTag,
  UserRole,
  UserSettingsDto
} from '@edu-feed/shared';
import { DEMO_AI_CONFIG, filterItemsForFeed, resolveTranslation } from '@edu-feed/shared';

import { estimateCostUsd, estimateTokens, fallbackModelForProvider, runCompletion } from './ai-runtime.js';
import type { AdminSnapshot, AppStore, FeedResponse, RegisterInput } from './store.js';

type UserWithSettings = Prisma.UserGetPayload<{
  include: {
    settings: true;
  };
}>;

type SourceWithFeeds = Prisma.SourceGetPayload<{
  include: {
    feeds: true;
  };
}>;

type ItemWithRelations = Prisma.ContentItemGetPayload<{
  include: {
    source: {
      include: {
        feeds: true;
      };
    };
    author: {
      include: {
        settings: true;
      };
    };
    translations: true;
    tags: true;
  };
}>;

type CommentWithAuthor = Prisma.CommentGetPayload<{
  include: {
    author: {
      include: {
        settings: true;
      };
    };
  };
}>;

type AlbumWithRelations = Prisma.AlbumGetPayload<{
  include: {
    owner: true;
    items: {
      orderBy: {
        position: 'asc';
      };
    };
  };
}>;

type SubmissionWithUser = Prisma.SubmissionGetPayload<{
  include: {
    submittedBy: true;
  };
}>;

type GeneratedStoryDraftWithRelations = Prisma.GeneratedStoryDraftGetPayload<{
  include: {
    requestedBy: true;
    reviewedBy: true;
  };
}>;

const DEFAULT_FONT = '"Fraunces", "Georgia", serif';
const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
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

function audienceLabelText(audience: ContentItem['audience']) {
  if (audience === 'kid_safe') return 'Kid Safe';
  if (audience === 'adult_only') return 'Adult Only';
  return 'Standard';
}

function moderationLabel(flag: ModerationFlag) {
  if (flag === 'not_verified') return 'Not Verified';
  if (flag === 'sensitive_history') return 'Sensitive History';
  return flag.toUpperCase();
}

function subjectToFeed(subject: ContentItem['subject']) {
  if (subject === 'country_knowledge') return 'country-knowledge';
  if (subject === 'video') return 'videos';
  return subject;
}

function buildSourceDefinition(source: SourceWithFeeds): SourceDefinition {
  const firstFeed = source.feeds[0];
  const subjects = JSON.parse(source.subjectsJson) as SourceDefinition['subjects'];
  return {
    id: source.id,
    name: source.name,
    slug: source.slug,
    iconUrl: source.iconUrl,
    siteUrl: source.siteUrl,
    feedUrl: firstFeed?.feedUrl || source.siteUrl,
    kind: firstFeed?.kind || 'rss',
    status: source.status,
    sourceType: source.sourceType,
    subjects,
    defaultAudience: source.defaultAudience,
    language: source.language,
    description: source.description
  };
}

function buildUserDto(user: UserWithSettings): UserSettingsDto {
  const settings = user.settings;
  return {
    username: user.username,
    displayName: settings?.displayName || user.username,
    role: user.role,
    language: settings?.language || 'en',
    contentLanguageMode: settings?.contentLanguageMode || 'single',
    vibePreset: settings?.vibePreset || 'museum',
    fontFamily: settings?.fontFamily || DEFAULT_FONT,
    fontScale: (settings?.fontScale as UserSettingsDto['fontScale']) || 'md',
    imageMode: (settings?.imageMode as UserSettingsDto['imageMode']) || 'on',
    themeMode: settings?.themeMode || 'light',
    contentMode: settings?.contentMode || 'standard',
    newsletterEnabled: settings?.newsletterEnabled || false,
    newsletterCadence: settings?.newsletterCadence || 'weekly',
    askAiEnabled: settings?.askAiEnabled ?? true,
    protectedModeEnabled: settings?.protectedModeEnabled ?? true
  };
}

function buildTags(item: ItemWithRelations): ContentTag[] {
  const tags = item.tags.map((tag) => ({
    id: tag.id,
    label: tag.label,
    type: tag.type as ContentTag['type'],
    value: tag.value
  }));

  if (!tags.some((tag) => tag.type === 'audience')) {
    tags.push({
      id: `audience-${item.id}`,
      label: audienceLabelText(item.audience),
      type: 'audience',
      value: item.audience
    });
  }
  if (!tags.some((tag) => tag.type === 'subject' && tag.value === item.subject)) {
    tags.unshift({
      id: `subject-${item.id}`,
      label: item.subject.replace('_', ' '),
      type: 'subject',
      value: item.subject
    });
  }
  return tags;
}

function buildAiArtifactAudit(record: {
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalCostUsd: Prisma.Decimal | number | null;
  createdAt: Date | null;
}) {
  if (!record.provider || !record.model || record.inputTokens === null || record.outputTokens === null || record.totalCostUsd === null || !record.createdAt) {
    return null;
  }

  return {
    provider: record.provider as ContentItem['ai']['summaryProvider'],
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalCostUsd: Number(record.totalCostUsd),
    createdAt: record.createdAt.toISOString()
  };
}

function buildItemDto(item: ItemWithRelations): ContentItem {
  const tags = buildTags(item);
  const subjectTags = tags.filter((tag) => tag.type === 'subject').map((tag) => tag.value) as ContentItem['subjects'];
  const flags = tags.filter((tag) => tag.type === 'flag').map((tag) => tag.value) as ModerationFlag[];
  const translatedArtifact = item.translations.find((translation) => translation.aiGeneratedAt) || null;

  return {
    id: item.id,
    slug: item.slug,
    kind: item.kind,
    sourceId: item.sourceId,
    sourceName: item.source.name,
    sourceIconUrl: item.source.iconUrl,
    sourceUrl: item.source.siteUrl,
    authorUsername: item.author?.username || null,
    publishedAt: item.publishedAt.toISOString(),
    originalTitle: item.originalTitle,
    originalSummary: item.originalSummary,
    coverImageUrl: item.coverImageUrl,
    externalUrl: item.externalUrl,
    youtubeVideoId: item.youtubeVideoId,
    subject: item.subject,
    subjects: subjectTags.length ? subjectTags : [item.subject],
    flags,
    audience: item.audience,
    pinned: item.pinned,
    commentsLocked: item.commentsLocked,
    hiddenByDefault: item.hiddenByDefault,
    removedAt: item.removedAt?.toISOString() || null,
    translations: item.translations.map((translation) => ({
      language: translation.language,
      title: translation.title,
      summary: translation.summary,
      slug: translation.slug,
      aiAudit: buildAiArtifactAudit({
        provider: translation.aiProvider,
        model: translation.aiModel,
        inputTokens: translation.aiInputTokens,
        outputTokens: translation.aiOutputTokens,
        totalCostUsd: translation.aiTotalCostUsd,
        createdAt: translation.aiGeneratedAt
      })
    })),
    tags,
    bodyMarkdown: item.bodyMarkdown,
    ai: {
      summaryProvider: (item.summaryAiProvider as ContentItem['ai']['summaryProvider']) || DEMO_AI_CONFIG.provider,
      summaryModel: item.summaryAiModel || DEMO_AI_CONFIG.summaryModel,
      translationProvider: (translatedArtifact?.aiProvider as ContentItem['ai']['translationProvider']) || DEMO_AI_CONFIG.provider,
      translationModel: translatedArtifact?.aiModel || DEMO_AI_CONFIG.translationModel,
      summaryAudit: buildAiArtifactAudit({
        provider: item.summaryAiProvider,
        model: item.summaryAiModel,
        inputTokens: item.summaryAiInputTokens,
        outputTokens: item.summaryAiOutputTokens,
        totalCostUsd: item.summaryAiTotalCostUsd,
        createdAt: item.summaryAiGeneratedAt
      }),
      translationAudit: translatedArtifact
        ? buildAiArtifactAudit({
            provider: translatedArtifact.aiProvider,
            model: translatedArtifact.aiModel,
            inputTokens: translatedArtifact.aiInputTokens,
            outputTokens: translatedArtifact.aiOutputTokens,
            totalCostUsd: translatedArtifact.aiTotalCostUsd,
            createdAt: translatedArtifact.aiGeneratedAt
          })
        : null,
      classificationAudit: buildAiArtifactAudit({
        provider: item.classificationAiProvider,
        model: item.classificationAiModel,
        inputTokens: item.classificationAiInputTokens,
        outputTokens: item.classificationAiOutputTokens,
        totalCostUsd: item.classificationAiTotalCostUsd,
        createdAt: item.classificationAiGeneratedAt
      })
    }
  };
}

function buildCommentDto(comment: CommentWithAuthor): CommentDto {
  return {
    id: comment.id,
    itemId: comment.itemId,
    authorUsername: comment.author.username,
    authorDisplayName: comment.author.settings?.displayName || comment.author.username,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() || null,
    deletedAt: comment.deletedAt?.toISOString() || null,
    moderationNote: comment.moderationNote
  };
}

function buildAlbumDto(album: AlbumWithRelations): AlbumDto {
  return {
    id: album.id,
    ownerUsername: album.owner.username,
    title: album.title,
    description: album.description,
    coverItemId: album.coverItemId,
    itemIds: album.items.map((item) => item.itemId),
    createdAt: album.createdAt.toISOString(),
    updatedAt: album.updatedAt.toISOString()
  };
}

function buildSubmissionDto(submission: SubmissionWithUser): SubmissionDto {
  return {
    id: submission.id,
    type: submission.type as SubmissionDto['type'],
    title: submission.title,
    sourceUrl: submission.sourceUrl,
    body: submission.body,
    submittedBy: submission.submittedBy.username,
    status: submission.status,
    createdAt: submission.createdAt.toISOString()
  };
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildGeneratedStoryDraftDto(draft: GeneratedStoryDraftWithRelations): GeneratedStoryDraftDto {
  return {
    id: draft.id,
    status: draft.status,
    subject: draft.subject,
    prompt: draft.prompt,
    requestedBy: draft.requestedBy.username,
    reviewedBy: draft.reviewedBy?.username || null,
    itemId: draft.itemId,
    title: draft.title,
    summary: draft.summary,
    bodyMarkdown: draft.bodyMarkdown,
    citations: parseJsonArray<GeneratedStoryCitation>(draft.citationsJson),
    verification: parseJsonObject<GeneratedStoryVerification>(draft.verificationJson),
    failureReason: draft.failureReason,
    totalCostUsd: Number(draft.totalCostUsd),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    generatedAt: draft.generatedAt?.toISOString() || null,
    reviewedAt: draft.reviewedAt?.toISOString() || null
  };
}

function aiConfigToDto(config: Prisma.AiConfigGetPayload<Record<string, never>>): AiModelConfig {
  return {
    provider: config.provider as AiModelConfig['provider'],
    summaryModel: config.summaryModel,
    translationModel: config.translationModel,
    askModel: config.askModel,
    newsletterModel: config.newsletterModel,
    monthlyBudgetUsd: Number(config.monthlyBudgetUsd),
    perJobBudgetUsd: Number(config.perJobBudgetUsd),
    autoDowngrade: config.autoDowngrade,
    pauseOnBudgetExceeded: config.pauseOnBudgetExceeded
  };
}

function aiUsageToDto(usage: Prisma.AiUsageLedgerGetPayload<Record<string, never>>): AiUsageSnapshot {
  return {
    provider: usage.provider as AiUsageSnapshot['provider'],
    model: usage.model,
    purpose: usage.purpose as AiUsageSnapshot['purpose'],
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalCostUsd: Number(usage.totalCostUsd),
    createdAt: usage.createdAt.toISOString()
  };
}

export class PrismaStore implements AppStore {
  private readonly modeSwitchTtlMs: number;

  private readonly appUrl: string;

  private readonly aiKeys: {
    OPENAI_API_KEY: string;
    ANTHROPIC_API_KEY: string;
    OPENROUTER_API_KEY: string;
  };

  private readonly modeVerifications = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaClient,
    options: {
      modeSwitchTtlMinutes: number;
      appUrl: string;
      aiKeys: {
        OPENAI_API_KEY?: string;
        ANTHROPIC_API_KEY?: string;
        OPENROUTER_API_KEY?: string;
      };
    }
  ) {
    this.modeSwitchTtlMs = options.modeSwitchTtlMinutes * 60 * 1000;
    this.appUrl = options.appUrl.replace(/\/$/, '');
    this.aiKeys = {
      OPENAI_API_KEY: options.aiKeys.OPENAI_API_KEY || '',
      ANTHROPIC_API_KEY: options.aiKeys.ANTHROPIC_API_KEY || '',
      OPENROUTER_API_KEY: options.aiKeys.OPENROUTER_API_KEY || ''
    };
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }

  async listSources() {
    const sources = await this.prisma.source.findMany({
      include: {
        feeds: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    return sources.map(buildSourceDefinition);
  }

  async getCurrentUser(sessionId?: string | null) {
    if (!sessionId) return null;
    const session = await this.prisma.session.findUnique({
      where: {
        tokenHash: hashToken(sessionId)
      },
      include: {
        user: {
          include: {
            settings: true
          }
        }
      }
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({
        where: {
          id: session.id
        }
      }).catch(() => undefined);
      return null;
    }
    return buildUserDto(session.user);
  }

  async register(input: RegisterInput) {
    const username = input.username.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: {
        username
      }
    });
    if (existing) throw new Error('Username is already taken.');

    const user = await this.prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        passwordHash: await argon2.hash(input.password),
        settings: {
          create: {
            displayName: input.displayName.trim() || input.username.trim(),
            language: 'en',
            contentLanguageMode: 'single',
            vibePreset: 'museum',
            fontFamily: DEFAULT_FONT,
            fontScale: 'md',
            imageMode: 'on',
            themeMode: 'light',
            contentMode: 'standard',
            newsletterEnabled: false,
            newsletterCadence: 'weekly',
            askAiEnabled: true,
            protectedModeEnabled: true
          }
        }
      },
      include: {
        settings: true
      }
    });

    const sessionId = await this.createSession(user.id);
    return {
      sessionId,
      user: buildUserDto(user)
    };
  }

  async login(username: string, password: string) {
    const normalized = username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: {
        username: normalized
      },
      include: {
        settings: true
      }
    });
    if (!user) throw new Error('Invalid username or password.');
    if (user.suspendedAt) throw new Error('This account is suspended.');
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new Error('Invalid username or password.');
    const sessionId = await this.createSession(user.id);
    return {
      sessionId,
      user: buildUserDto(user)
    };
  }

  async logout(sessionId?: string | null) {
    if (!sessionId) return;
    await this.prisma.session.deleteMany({
      where: {
        tokenHash: hashToken(sessionId)
      }
    });
  }

  async verifyPassword(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        username
      }
    });
    if (!user) throw new Error('Account not found.');
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new Error('Invalid password.');
    const verifiedUntil = Date.now() + this.modeSwitchTtlMs;
    this.modeVerifications.set(username, verifiedUntil);
    return new Date(verifiedUntil).toISOString();
  }

  async switchContentMode(username: string, nextMode: ContentMode, password?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: {
        username
      },
      include: {
        settings: true
      }
    });
    if (!user?.settings) throw new Error('Account not found.');
    const currentMode = user.settings.contentMode;
    const movingIntoOrOutOfProtectedMode = currentMode !== 'standard' || nextMode !== 'standard';
    if (movingIntoOrOutOfProtectedMode) {
      if (password?.trim()) {
        await this.verifyPassword(username, password);
      } else {
        const verifiedUntil = this.modeVerifications.get(username) || 0;
        if (verifiedUntil < Date.now()) {
          throw new Error('Password verification is required before switching this mode.');
        }
      }
    }
    await this.prisma.$transaction([
      this.prisma.userSettings.update({
        where: {
          userId: user.id
        },
        data: {
          contentMode: nextMode
        }
      }),
      this.prisma.modeSwitchAudit.create({
        data: {
          userId: user.id,
          fromMode: currentMode,
          toMode: nextMode
        }
      })
    ]);

    return {
      ok: true,
      nextMode,
      verifiedUntil: new Date(Date.now() + this.modeSwitchTtlMs).toISOString()
    };
  }

  async forgotPassword(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: normalized },
          { email: normalized }
        ]
      }
    });
    if (!user) {
      return { ok: true as const, previewToken: null };
    }
    const token = `reset_${randomUUID()}`;
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });
    return {
      ok: true as const,
      previewToken: token
    };
  }

  async resetPassword(token: string, nextPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: {
        tokenHash: hashToken(token)
      }
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new Error('Reset token is invalid or expired.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: record.userId
        },
        data: {
          passwordHash: await argon2.hash(nextPassword)
        }
      }),
      this.prisma.passwordResetToken.update({
        where: {
          id: record.id
        },
        data: {
          usedAt: new Date()
        }
      })
    ]);
    return { ok: true as const };
  }

  async getFeed(query: FeedQuery, username?: string | null): Promise<FeedResponse> {
    const viewer = username
      ? await this.prisma.user.findUnique({
          where: { username },
          include: { settings: true }
        })
      : null;
    const mode = viewer?.settings?.contentMode || 'standard';
    const hiddenIds = viewer
      ? (await this.prisma.hiddenItem.findMany({
          where: { userId: viewer.id },
          select: { itemId: true }
        })).map((entry) => entry.itemId)
      : [];
    const savedIds = viewer
      ? (await this.prisma.savedItem.findMany({
          where: { userId: viewer.id },
          select: { itemId: true }
        })).map((entry) => entry.itemId)
      : [];
    const itemRecords = await this.prisma.contentItem.findMany({
      where: {
        removedAt: null
      },
      include: {
        source: {
          include: {
            feeds: true
          }
        },
        author: {
          include: {
            settings: true
          }
        },
        translations: true,
        tags: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    const allItems = itemRecords.map(buildItemDto);
    let items =
      query.feed === 'saved'
        ? allItems.filter((item) => savedIds.includes(item.id))
        : filterItemsForFeed(allItems, query.feed, mode, hiddenIds);

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

    const pinnedIds = (await this.prisma.pinnedSlot.findMany({
      where: {
        feed: query.feed
      },
      select: {
        itemId: true
      }
    })).map((entry) => entry.itemId);

    const pinnedItems = items.filter((item) => pinnedIds.includes(item.id) || (item.pinned && query.feed !== 'saved'));

    return {
      items,
      pinnedItems,
      savedIds,
      hiddenIds,
      mode,
      feed: query.feed
    };
  }

  async getItem(idOrSlug: string, username?: string | null) {
    const record = await this.findItem(idOrSlug);
    if (!record) return null;
    const dto = buildItemDto(record);
    const viewer = username
      ? await this.prisma.user.findUnique({
          where: { username },
          include: { settings: true }
        })
      : null;
    const mode = viewer?.settings?.contentMode || 'standard';
    return filterItemsForFeed([dto], 'saved', mode).length ? dto : null;
  }

  async recordItemView(username: string, itemId: string) {
    const [user, item] = await Promise.all([this.requireUser(username), this.findItem(itemId)]);
    if (!item || item.removedAt) throw new Error('Item not found.');
    await this.prisma.itemView.upsert({
      where: {
        userId_itemId: {
          userId: user.id,
          itemId: item.id
        }
      },
      update: {
        viewCount: {
          increment: 1
        },
        lastViewedAt: new Date()
      },
      create: {
        userId: user.id,
        itemId: item.id
      }
    });
    return {
      ok: true
    };
  }

  async getProfileItems(username: string) {
    const items = await this.prisma.contentItem.findMany({
      where: {
        author: {
          username
        },
        removedAt: null
      },
      include: {
        source: {
          include: {
            feeds: true
          }
        },
        author: {
          include: {
            settings: true
          }
        },
        translations: true,
        tags: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    return items.map(buildItemDto);
  }

  async listComments(itemId: string) {
    const comments = await this.prisma.comment.findMany({
      where: {
        itemId,
        deletedAt: null
      },
      include: {
        author: {
          include: {
            settings: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    return comments.map(buildCommentDto);
  }

  async addComment(username: string, itemId: string, body: string) {
    const [user, item] = await Promise.all([
      this.prisma.user.findUnique({
        where: { username },
        include: { settings: true }
      }),
      this.prisma.contentItem.findUnique({
        where: { id: itemId }
      })
    ]);
    if (!user?.settings) throw new Error('Account not found.');
    if (!item || item.removedAt) throw new Error('Item not found.');
    if (item.commentsLocked) throw new Error('Comments are locked for this item.');
    const comment = await this.prisma.comment.create({
      data: {
        itemId,
        authorId: user.id,
        body
      },
      include: {
        author: {
          include: {
            settings: true
          }
        }
      }
    });
    return buildCommentDto(comment);
  }

  async hideItem(username: string, itemId: string) {
    const user = await this.requireUser(username);
    await this.prisma.hiddenItem.upsert({
      where: {
        userId_itemId: {
          userId: user.id,
          itemId
        }
      },
      update: {},
      create: {
        userId: user.id,
        itemId
      }
    });
    const hiddenIds = (await this.prisma.hiddenItem.findMany({
      where: { userId: user.id },
      select: { itemId: true }
    })).map((entry) => entry.itemId);
    return { ok: true as const, hiddenIds };
  }

  async saveItem(username: string, itemId: string) {
    const user = await this.requireUser(username);
    await this.prisma.savedItem.upsert({
      where: {
        userId_itemId: {
          userId: user.id,
          itemId
        }
      },
      update: {},
      create: {
        userId: user.id,
        itemId
      }
    });
    const savedIds = (await this.prisma.savedItem.findMany({
      where: { userId: user.id },
      select: { itemId: true }
    })).map((entry) => entry.itemId);
    return { ok: true as const, savedIds };
  }

  async unsaveItem(username: string, itemId: string) {
    const user = await this.requireUser(username);
    await this.prisma.savedItem.deleteMany({
      where: {
        userId: user.id,
        itemId
      }
    });
    const savedIds = (await this.prisma.savedItem.findMany({
      where: { userId: user.id },
      select: { itemId: true }
    })).map((entry) => entry.itemId);
    return { ok: true as const, savedIds };
  }

  async getAlbums(username: string) {
    const albums = await this.prisma.album.findMany({
      where: {
        owner: {
          username
        }
      },
      include: {
        owner: true,
        items: {
          orderBy: {
            position: 'asc'
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    return albums.map(buildAlbumDto);
  }

  async getAlbum(username: string, albumId: string) {
    const album = await this.prisma.album.findFirst({
      where: {
        id: albumId,
        owner: {
          username
        }
      },
      include: {
        owner: true,
        items: {
          orderBy: {
            position: 'asc'
          }
        }
      }
    });
    if (!album) return null;

    const itemRecords = await this.prisma.contentItem.findMany({
      where: {
        id: {
          in: album.items.map((entry) => entry.itemId)
        },
        removedAt: null
      },
      include: {
        source: {
          include: {
            feeds: true
          }
        },
        author: {
          include: {
            settings: true
          }
        },
        translations: true,
        tags: true
      }
    });
    const itemsById = new Map(itemRecords.map((item) => [item.id, buildItemDto(item)]));

    return {
      album: buildAlbumDto(album),
      items: album.items
        .map((entry) => itemsById.get(entry.itemId))
        .filter(Boolean) as ContentItem[]
    };
  }

  async createAlbum(username: string, title: string, description: string) {
    const user = await this.requireUser(username);
    const album = await this.prisma.album.create({
      data: {
        ownerId: user.id,
        title,
        description
      },
      include: {
        owner: true,
        items: {
          orderBy: {
            position: 'asc'
          }
        }
      }
    });
    return buildAlbumDto(album);
  }

  async updateAlbum(
    username: string,
    albumId: string,
    patch: Partial<Pick<AlbumDto, 'title' | 'description' | 'coverItemId' | 'itemIds'>>
  ) {
    const user = await this.requireUser(username);
    const album = await this.prisma.album.findFirst({
      where: {
        id: albumId,
        ownerId: user.id
      },
      include: {
        owner: true,
        items: {
          orderBy: {
            position: 'asc'
          }
        }
      }
    });
    if (!album) throw new Error('Album not found.');

    const currentItemIds = album.items.map((entry) => entry.itemId);
    const nextItemIds = patch.itemIds ? [...patch.itemIds] : currentItemIds;
    const currentItemSet = new Set(currentItemIds);

    if (new Set(nextItemIds).size !== nextItemIds.length) {
      throw new Error('Album item order cannot contain duplicates.');
    }
    if (nextItemIds.some((itemId) => !currentItemSet.has(itemId))) {
      throw new Error('Album updates can only reorder or remove existing items.');
    }

    const nextCoverItemId = patch.coverItemId !== undefined ? patch.coverItemId : album.coverItemId;
    if (nextCoverItemId && !nextItemIds.includes(nextCoverItemId)) {
      throw new Error('Cover item must belong to the album.');
    }

    await this.prisma.$transaction(async (tx) => {
      if (patch.itemIds) {
        if (nextItemIds.length) {
          await tx.albumItem.deleteMany({
            where: {
              albumId,
              itemId: {
                notIn: nextItemIds
              }
            }
          });
        } else {
          await tx.albumItem.deleteMany({
            where: {
              albumId
            }
          });
        }

        await Promise.all(
          nextItemIds.map((itemId, index) =>
            tx.albumItem.update({
              where: {
                albumId_itemId: {
                  albumId,
                  itemId
                }
              },
              data: {
                position: index
              }
            })
          )
        );
      }

      await tx.album.update({
        where: {
          id: albumId
        },
        data: {
          title: patch.title,
          description: patch.description,
          coverItemId: nextItemIds.length ? nextCoverItemId || nextItemIds[0] : null
        }
      });
    });

    const updated = await this.prisma.album.findUnique({
      where: {
        id: albumId
      },
      include: {
        owner: true,
        items: {
          orderBy: {
            position: 'asc'
          }
        }
      }
    });
    if (!updated) throw new Error('Album not found.');
    return buildAlbumDto(updated);
  }

  async deleteAlbum(username: string, albumId: string) {
    const user = await this.requireUser(username);
    const deleted = await this.prisma.album.deleteMany({
      where: {
        id: albumId,
        ownerId: user.id
      }
    });
    if (!deleted.count) throw new Error('Album not found.');
    return { ok: true as const };
  }

  async addAlbumItem(username: string, albumId: string, itemId: string) {
    const user = await this.requireUser(username);
    const album = await this.prisma.album.findFirst({
      where: {
        id: albumId,
        ownerId: user.id
      },
      include: {
        owner: true,
        items: {
          orderBy: {
            position: 'asc'
          }
        }
      }
    });
    if (!album) throw new Error('Album not found.');
    const nextPosition = album.items.length;
    await this.prisma.albumItem.upsert({
      where: {
        albumId_itemId: {
          albumId,
          itemId
        }
      },
      update: {},
      create: {
        albumId,
        itemId,
        position: nextPosition
      }
    });
    const updated = await this.prisma.album.update({
      where: {
        id: albumId
      },
      data: {
        coverItemId: album.coverItemId || itemId
      },
      include: {
        owner: true,
        items: {
          orderBy: {
            position: 'asc'
          }
        }
      }
    });
    return buildAlbumDto(updated);
  }

  async createSubmission(username: string, input: { type: 'link' | 'community_post'; title: string; sourceUrl?: string | null; body?: string | null }) {
    const user = await this.requireUser(username);
    const submission = await this.prisma.submission.create({
      data: {
        type: input.type,
        title: input.title,
        sourceUrl: input.sourceUrl || null,
        body: input.body || null,
        submittedById: user.id
      },
      include: {
        submittedBy: true
      }
    });
    return buildSubmissionDto(submission);
  }

  async updateComment(username: string, commentId: string, body: string) {
    const user = await this.requireUser(username);
    const existing = await this.prisma.comment.findUnique({
      where: {
        id: commentId
      },
      include: {
        author: {
          include: {
            settings: true
          }
        },
        item: {
          select: {
            commentsLocked: true
          }
        }
      }
    });
    if (!existing || existing.deletedAt) throw new Error('Comment not found.');
    if (existing.authorId !== user.id) throw new Error('You can only edit your own comments.');
    if (existing.item.commentsLocked) throw new Error('Comments are locked for this item.');
    if (Date.now() - existing.createdAt.getTime() > COMMENT_EDIT_WINDOW_MS) {
      throw new Error('The comment edit window has expired.');
    }

    const updated = await this.prisma.comment.update({
      where: {
        id: commentId
      },
      data: {
        body,
        editedAt: new Date()
      },
      include: {
        author: {
          include: {
            settings: true
          }
        }
      }
    });

    return buildCommentDto(updated);
  }

  async askAi(itemId: string, question: string, language: InterfaceLanguage, username?: string | null) {
    const [item, viewer] = await Promise.all([
      this.getItem(itemId, username),
      username
        ? this.prisma.user.findUnique({
            where: { username },
            include: { settings: true }
          })
        : Promise.resolve(null)
    ]);
    if (!item) throw new Error('Item not found.');
    if (viewer?.settings && !viewer.settings.askAiEnabled) {
      throw new Error('Ask-AI is disabled in your settings.');
    }
    const translation = resolveTranslation(item, language);
    const fallbackAnswer =
      language === 'bg'
        ? `За "${translation?.title}" бих започнал с произхода на източника, ключовия аргумент и какви допълнителни първични или музейни материали можеш да потърсиш. Въпросът ти беше: ${question}`
        : `For "${translation?.title}", start with the source context, the central claim, and which museum, archive, or primary materials could deepen the story. Your question was: ${question}`;
    const citations = [item.externalUrl || `${this.appUrl}/item/${item.slug}`];
    const aiConfig = await this.getEffectiveAiConfig();
    const contentMode = viewer?.settings?.contentMode || 'standard';

    const systemPrompt =
      language === 'bg'
        ? [
            'Ти си образователен помощник. Отговори с максимум един абзац, остани върху текущата статия и не измисляй факти.',
            contentMode === 'kid'
              ? 'Пази тона подходящ за деца: не давай графични, сексуални или зрели подробности; обобщавай чувствителните теми на високо ниво и предлагай безопасни посоки за учене.'
              : contentMode === 'standard'
                ? 'Пази отговора на общообразователно ниво и избягвай ненужни шокиращи или зрели подробности.'
                : 'Запази академичен тон и стой в рамките на дадения материал.'
          ].join(' ')
        : [
            'You are an educational assistant. Answer in one short paragraph, stay scoped to the current article, and avoid unsupported claims.',
            contentMode === 'kid'
              ? 'Keep the answer kid-safe: do not provide graphic, sexual, or mature detail; summarize sensitive material only at a high level and steer toward safe research directions.'
              : contentMode === 'standard'
                ? 'Keep the answer broadly educational and avoid unnecessary disturbing or explicit detail.'
                : 'Keep an academic tone and stay tightly grounded in the supplied item.'
          ].join(' ');
    const userPrompt = [
      `Title: ${translation?.title || item.originalTitle}`,
      `Summary: ${translation?.summary || item.originalSummary}`,
      `Tags: ${item.tags.map((tag) => `${tag.type}:${tag.value}`).join(', ')}`,
      `Question: ${question}`
    ].join('\n');
    const estimatedInput = estimateTokens(`${systemPrompt}\n${userPrompt}`);
    const estimatedOutput = 260;

    let model = aiConfig.askModel;
    let estimatedCost = estimateCostUsd(model, estimatedInput, estimatedOutput);
    if (aiConfig.autoDowngrade && estimatedCost > aiConfig.perJobBudgetUsd) {
      model = fallbackModelForProvider(aiConfig.provider);
      estimatedCost = estimateCostUsd(model, estimatedInput, estimatedOutput);
    }

    const monthlySpent = await this.getMonthlyAiSpendUsd();
    const monthlyLimitReached = monthlySpent + estimatedCost > aiConfig.monthlyBudgetUsd;
    if (monthlyLimitReached && aiConfig.pauseOnBudgetExceeded) {
      await this.prisma.systemErrorEvent.create({
        data: {
          scope: 'ai',
          level: 'warn',
          message: `Ask-AI fallback triggered: monthly budget reached for provider ${aiConfig.provider}.`
        }
      });
      return {
        answer: fallbackAnswer,
        citations
      };
    }

    if (estimatedCost > aiConfig.perJobBudgetUsd) {
      await this.prisma.systemErrorEvent.create({
        data: {
          scope: 'ai',
          level: 'warn',
          message: `Ask-AI fallback triggered: per-job budget exceeded for model ${model}.`
        }
      });
      return {
        answer: fallbackAnswer,
        citations
      };
    }

    try {
      const completion = await runCompletion({
        provider: aiConfig.provider,
        model,
        systemPrompt,
        userPrompt,
        temperature: 0.2,
        maxOutputTokens: estimatedOutput,
        keys: this.aiKeys
      });
      const finalCost = estimateCostUsd(model, completion.inputTokens, completion.outputTokens);
      await this.prisma.aiUsageLedger.create({
        data: {
          itemId: item.id,
          provider: aiConfig.provider,
          model,
          purpose: 'ask',
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          totalCostUsd: finalCost
        }
      });

      return {
        answer: completion.text,
        citations
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Ask-AI provider failure.';
      await this.prisma.systemErrorEvent.create({
        data: {
          scope: 'ai',
          level: 'warn',
          message: `Ask-AI provider fallback: ${message}`
        }
      });
    }

    return {
      answer: fallbackAnswer,
      citations
    };
  }

  async shareItem(itemId: string) {
    const item = await this.prisma.contentItem.findFirst({
      where: {
        OR: [
          { id: itemId },
          { slug: itemId }
        ]
      },
      select: {
        slug: true
      }
    });
    if (!item) throw new Error('Item not found.');
    return {
      ok: true as const,
      shareUrl: `${this.appUrl}/item/${item.slug}`
    };
  }

  async getAdminSnapshot(): Promise<AdminSnapshot> {
    const [sources, submissions, users, items, comments, errorLogs, aiConfig, aiUsage, generatedStories] = await Promise.all([
      this.listSources(),
      this.prisma.submission.findMany({
        include: {
          submittedBy: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }),
      this.prisma.user.findMany({
        include: {
          settings: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }),
      this.prisma.contentItem.findMany({
        include: {
          source: {
            include: {
              feeds: true
            }
          },
          author: {
            include: {
              settings: true
            }
          },
          translations: true,
          tags: true
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 24
      }),
      this.prisma.comment.findMany({
        include: {
          author: {
            include: {
              settings: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      }),
      this.prisma.systemErrorEvent.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      }),
      this.prisma.aiConfig.findUnique({
        where: {
          id: 1
        }
      }),
      this.prisma.aiUsageLedger.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        take: 20
      }),
      this.prisma.generatedStoryDraft.findMany({
        include: {
          requestedBy: true,
          reviewedBy: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 30
      })
    ]);

    return {
      sources,
      submissions: submissions.map(buildSubmissionDto),
      users: users.map(buildUserDto),
      items: items.map(buildItemDto),
      comments: comments.map(buildCommentDto),
      errorLogs: errorLogs.map((log) => ({
        id: log.id,
        scope: log.scope,
        message: log.message,
        level: log.level,
        createdAt: log.createdAt.toISOString(),
        resolvedAt: log.resolvedAt?.toISOString() || null
      })),
      aiConfig: aiConfig ? aiConfigToDto(aiConfig) : DEMO_AI_CONFIG,
      aiUsage: aiUsage.map(aiUsageToDto),
      generatedStories: generatedStories.map(buildGeneratedStoryDraftDto)
    };
  }

  async listGeneratedStoryDrafts() {
    const drafts = await this.prisma.generatedStoryDraft.findMany({
      include: {
        requestedBy: true,
        reviewedBy: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return drafts.map(buildGeneratedStoryDraftDto);
  }

  async requestGeneratedStory(username: string, input: { subject: SubjectTag; prompt: string }) {
    const user = await this.requireUser(username);
    const draft = await this.prisma.generatedStoryDraft.create({
      data: {
        subject: input.subject,
        prompt: input.prompt.trim(),
        requestedById: user.id,
        citationsJson: '[]'
      },
      include: {
        requestedBy: true,
        reviewedBy: true
      }
    });
    return buildGeneratedStoryDraftDto(draft);
  }

  async reviewGeneratedStory(username: string, draftId: string, decision: 'approved' | 'rejected') {
    const reviewer = await this.requireUser(username);
    const draft = await this.prisma.generatedStoryDraft.findUnique({
      where: {
        id: draftId
      },
      include: {
        requestedBy: true,
        reviewedBy: true
      }
    });
    if (!draft) throw new Error('Generated draft not found.');
    if (draft.status === 'approved') {
      return {
        draft: buildGeneratedStoryDraftDto(draft),
        item: draft.itemId ? await this.getItem(draft.itemId, username) : null
      };
    }
    if (decision === 'rejected') {
      const rejected = await this.prisma.generatedStoryDraft.update({
        where: {
          id: draftId
        },
        data: {
          status: 'rejected',
          reviewedById: reviewer.id,
          reviewedAt: new Date()
        },
        include: {
          requestedBy: true,
          reviewedBy: true
        }
      });
      return {
        draft: buildGeneratedStoryDraftDto(rejected),
        item: null
      };
    }

    if (draft.status !== 'draft') {
      throw new Error('Only verified draft stories can be approved.');
    }
    if (!draft.title?.trim() || !draft.summary?.trim() || !draft.bodyMarkdown?.trim()) {
      throw new Error('Generated draft is incomplete and cannot be approved.');
    }
    const citations = parseJsonArray<GeneratedStoryCitation>(draft.citationsJson);
    const verifier = parseJsonObject<GeneratedStoryVerification>(draft.verificationJson);
    if (!citations.length || !verifier?.passed) {
      throw new Error('Generated draft requires passing verification and at least one source citation before approval.');
    }

    let approvedItem: ContentItem | null = null;
    await this.prisma.$transaction(async (tx) => {
      const source = await this.ensureGeneratedStorySource(tx);
      const title = draft.title!.trim();
      const summary = draft.summary!.trim();
      const slugBase = slugify(title) || `generated-story-${randomUUID().slice(0, 8)}`;
      const sourceList = citations
        .map((citation) => `- [${citation.title}](${citation.url}) - ${citation.sourceName}`)
        .join('\n');
      const bodyMarkdown = `${draft.bodyMarkdown!.trim()}\n\n## Sources\n${sourceList}`;
      const citedItem = citations[0]
        ? await tx.contentItem.findFirst({
            where: {
              externalUrl: citations[0].url
            },
            select: {
              coverImageUrl: true
            }
          })
        : null;
      const item = await tx.contentItem.create({
        data: {
          id: `item-${randomUUID()}`,
          slug: `${slugBase}-${randomUUID().slice(0, 8)}`,
          dedupeKey: hashToken(`generated-story:${draft.id}`),
          kind: 'generated_story',
          sourceId: source.id,
          authorId: draft.requestedById,
          publishedAt: new Date(),
          originalTitle: title,
          originalSummary: summary,
          bodyMarkdown,
          coverImageUrl: citedItem?.coverImageUrl || source.iconUrl,
          externalUrl: null,
          youtubeVideoId: null,
          subject: draft.subject,
          audience: 'standard_only',
          translations: {
            create: [
              {
                language: 'en',
                title,
                summary,
                slug: `${slugBase}-en`
              },
              {
                language: 'bg',
                title,
                summary,
                slug: `${slugBase}-bg`
              }
            ]
          },
          tags: {
            create: [
              {
                label: draft.subject.replace('_', ' '),
                type: 'subject',
                value: draft.subject
              },
              {
                label: 'Standard',
                type: 'audience',
                value: 'standard_only'
              },
              {
                label: 'AI Draft',
                type: 'meta',
                value: 'ai_generated'
              },
              {
                label: 'Cited Sources',
                type: 'meta',
                value: 'cited_sources'
              }
            ]
          }
        },
        include: {
          source: {
            include: {
              feeds: true
            }
          },
          author: {
            include: {
              settings: true
            }
          },
          translations: true,
          tags: true
        }
      });
      await tx.generatedStoryDraft.update({
        where: {
          id: draftId
        },
        data: {
          status: 'approved',
          itemId: item.id,
          reviewedById: reviewer.id,
          reviewedAt: new Date()
        }
      });
      approvedItem = buildItemDto(item);
    });

    const updated = await this.prisma.generatedStoryDraft.findUnique({
      where: {
        id: draftId
      },
      include: {
        requestedBy: true,
        reviewedBy: true
      }
    });
    if (!updated) throw new Error('Generated draft not found.');
    return {
      draft: buildGeneratedStoryDraftDto(updated),
      item: approvedItem
    };
  }

  async addSource(source: Omit<SourceDefinition, 'id'>) {
    const created = await this.prisma.source.create({
      data: {
        id: `src-${randomUUID()}`,
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
            feedUrl: source.feedUrl
          }
        }
      },
      include: {
        feeds: true
      }
    });
    return buildSourceDefinition(created);
  }

  async updateSource(sourceId: string, patch: Partial<Omit<SourceDefinition, 'id'>>) {
    const current = await this.prisma.source.findUnique({
      where: {
        id: sourceId
      },
      include: {
        feeds: true
      }
    });
    if (!current) throw new Error('Source not found.');

    const baseline = buildSourceDefinition(current);
    const next = {
      ...baseline,
      ...patch,
      subjects: patch.subjects || baseline.subjects
    };
    const primaryFeed = current.feeds[0];

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.source.update({
        where: {
          id: sourceId
        },
        data: {
          name: next.name,
          slug: next.slug,
          iconUrl: next.iconUrl,
          siteUrl: next.siteUrl,
          description: next.description,
          subjectsJson: JSON.stringify(next.subjects),
          language: next.language,
          defaultAudience: next.defaultAudience,
          sourceType: next.sourceType,
          status: next.status
        }
      });

      if (primaryFeed) {
        await tx.sourceFeed.update({
          where: {
            id: primaryFeed.id
          },
          data: {
            kind: next.kind,
            feedUrl: next.feedUrl
          }
        });
      } else {
        await tx.sourceFeed.create({
          data: {
            sourceId,
            kind: next.kind,
            feedUrl: next.feedUrl
          }
        });
      }

      return tx.source.findUnique({
        where: {
          id: sourceId
        },
        include: {
          feeds: true
        }
      });
    });
    if (!updated) throw new Error('Source not found.');
    return buildSourceDefinition(updated);
  }

  async deleteSource(sourceId: string) {
    const deleted = await this.prisma.source.deleteMany({
      where: {
        id: sourceId
      }
    });
    if (!deleted.count) {
      throw new Error('Source not found.');
    }
    return { ok: true as const };
  }

  async reviewSubmission(submissionId: string, decision: 'approved' | 'rejected') {
    const submission = await this.prisma.submission.findUnique({
      where: {
        id: submissionId
      },
      include: {
        submittedBy: true
      }
    });
    if (!submission) throw new Error('Submission not found.');

    let approvedItem: ContentItem | null = null;
    if (decision === 'approved' && submission.status !== 'approved') {
      await this.prisma.$transaction(async (tx) => {
        const source = await this.ensureCommunitySource(tx);
        const title = submission.title.trim();
        const summary =
          submission.body?.trim().slice(0, 280) ||
          `An approved community submission from ${submission.submittedBy.username} that is now available in the community feed.`;
        const slugBase = slugify(title) || `community-${randomUUID().slice(0, 8)}`;
        const item = await tx.contentItem.create({
          data: {
            id: `item-${randomUUID()}`,
            slug: `${slugBase}-${randomUUID().slice(0, 8)}`,
            dedupeKey: hashToken(`submission:${submission.id}`),
            kind: 'community_post',
            sourceId: source.id,
            authorId: submission.submittedById,
            publishedAt: new Date(),
            originalTitle: title,
            originalSummary: summary,
            bodyMarkdown: submission.body || null,
            coverImageUrl: source.iconUrl,
            externalUrl: submission.sourceUrl || null,
            subject: 'community',
            audience: 'standard_only',
            translations: {
              create: [
                {
                  language: 'en',
                  title,
                  summary,
                  slug: `${slugBase}-en`
                },
                {
                  language: 'bg',
                  title,
                  summary,
                  slug: `${slugBase}-bg`
                }
              ]
            },
            tags: {
              create: [
                {
                  label: 'Community',
                  type: 'subject',
                  value: 'community'
                },
                {
                  label: 'Not Verified',
                  type: 'flag',
                  value: 'not_verified'
                },
                {
                  label: 'Standard',
                  type: 'audience',
                  value: 'standard_only'
                }
              ]
            }
          },
          include: {
            source: {
              include: {
                feeds: true
              }
            },
            author: {
              include: {
                settings: true
              }
            },
            translations: true,
            tags: true
          }
        });
        approvedItem = buildItemDto(item);

        await tx.submission.update({
          where: {
            id: submissionId
          },
          data: {
            status: 'approved',
            reviewedAt: new Date()
          }
        });
      });
    } else if (decision === 'rejected' && submission.status !== 'rejected') {
      await this.prisma.submission.update({
        where: {
          id: submissionId
        },
        data: {
          status: 'rejected',
          reviewedAt: new Date()
        }
      });
    } else if (decision === 'approved') {
      const existing = await this.prisma.contentItem.findFirst({
        where: {
          authorId: submission.submittedById,
          kind: 'community_post',
          originalTitle: submission.title
        },
        include: {
          source: {
            include: {
              feeds: true
            }
          },
          author: {
            include: {
              settings: true
            }
          },
          translations: true,
          tags: true
        }
      });
      approvedItem = existing ? buildItemDto(existing) : null;
    }

    const updated = await this.prisma.submission.findUnique({
      where: {
        id: submissionId
      },
      include: {
        submittedBy: true
      }
    });
    if (!updated) throw new Error('Submission not found.');
    return {
      submission: buildSubmissionDto(updated),
      item: approvedItem
    };
  }

  async deleteComment(commentId: string, moderationNote?: string) {
    const updated = await this.prisma.comment.update({
      where: {
        id: commentId
      },
      data: {
        deletedAt: new Date(),
        moderationNote: moderationNote || 'Deleted by admin.'
      },
      include: {
        author: {
          include: {
            settings: true
          }
        }
      }
    });
    return buildCommentDto(updated);
  }

  async patchItem(
    itemId: string,
    patch: Partial<Pick<ContentItem, 'audience' | 'commentsLocked' | 'flags' | 'hiddenByDefault' | 'pinned'>>
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.contentItem.update({
        where: { id: itemId },
        data: {
          audience: patch.audience,
          commentsLocked: patch.commentsLocked,
          hiddenByDefault: patch.hiddenByDefault,
          pinned: patch.pinned
        }
      });

      if (patch.flags) {
        await tx.contentTag.deleteMany({
          where: {
            itemId,
            type: 'flag'
          }
        });
        if (patch.flags.length) {
          await tx.contentTag.createMany({
            data: patch.flags.map((flag) => ({
              itemId,
              label: moderationLabel(flag),
              type: 'flag',
              value: flag
            }))
          });
        }
      }

      if (patch.audience) {
        await tx.contentTag.deleteMany({
          where: {
            itemId,
            type: 'audience'
          }
        });
        await tx.contentTag.create({
          data: {
            itemId,
            label: audienceLabelText(patch.audience),
            type: 'audience',
            value: patch.audience
          }
        });
      }

      if (patch.pinned === false) {
        await tx.pinnedSlot.deleteMany({
          where: {
            itemId
          }
        });
      }
    });

    const updated = await this.findItem(itemId);
    if (!updated) throw new Error('Item not found.');
    return buildItemDto(updated);
  }

  async removeItem(itemId: string, removed: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await tx.contentItem.update({
        where: {
          id: itemId
        },
        data: {
          removedAt: removed ? new Date() : null,
          pinned: removed ? false : undefined
        }
      });

      if (removed) {
        await tx.pinnedSlot.deleteMany({
          where: {
            itemId
          }
        });
      }
    });
    const updated = await this.findItem(itemId, true);
    if (!updated) throw new Error('Item not found.');
    return buildItemDto(updated);
  }

  async pinItem(itemId: string, slot: number) {
    const item = await this.prisma.contentItem.findUnique({
      where: { id: itemId }
    });
    if (!item) throw new Error('Item not found.');
    const feed = subjectToFeed(item.subject);
    await this.prisma.$transaction([
      this.prisma.contentItem.update({
        where: { id: itemId },
        data: { pinned: true }
      }),
      this.prisma.pinnedSlot.upsert({
        where: {
          feed_slot: {
            feed,
            slot
          }
        },
        update: {
          itemId
        },
        create: {
          feed,
          slot,
          itemId
        }
      })
    ]);

    const updated = await this.findItem(itemId);
    if (!updated) throw new Error('Item not found.');
    return buildItemDto(updated);
  }

  async lockComments(itemId: string, locked: boolean) {
    return this.patchItem(itemId, { commentsLocked: locked });
  }

  async suspendUser(username: string, suspended: boolean) {
    const user = await this.requireUser(username);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: user.id
        },
        data: {
          suspendedAt: suspended ? new Date() : null
        }
      }),
      this.prisma.userSettings.updateMany({
        where: {
          userId: user.id
        },
        data: {
          protectedModeEnabled: !suspended
        }
      }),
      ...(suspended
        ? [
            this.prisma.systemErrorEvent.create({
              data: {
                scope: 'api',
                level: 'warn',
                message: `User ${username} was suspended by admin action.`
              }
            })
          ]
        : [])
    ]);

    const updated = await this.prisma.user.findUnique({
      where: {
        id: user.id
      },
      include: {
        settings: true
      }
    });
    if (!updated) throw new Error('Account not found.');
    return buildUserDto(updated);
  }

  async setUserRole(username: string, role: UserRole) {
    const user = await this.requireUser(username);
    if (user.role === role) return buildUserDto(user);
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await this.prisma.user.count({
        where: {
          role: 'admin'
        }
      });
      if (adminCount <= 1) {
        throw new Error('At least one admin account must remain.');
      }
    }

    const updated = await this.prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        role
      },
      include: {
        settings: true
      }
    });

    return buildUserDto(updated);
  }

  async updateAiConfig(patch: Partial<AiModelConfig>) {
    const current = await this.prisma.aiConfig.findUnique({
      where: { id: 1 }
    });
    const baseline = current ? aiConfigToDto(current) : DEMO_AI_CONFIG;
    const next = {
      ...baseline,
      ...patch
    };
    const stored = await this.prisma.aiConfig.upsert({
      where: {
        id: 1
      },
      create: {
        id: 1,
        provider: next.provider,
        summaryModel: next.summaryModel,
        translationModel: next.translationModel,
        askModel: next.askModel,
        newsletterModel: next.newsletterModel,
        monthlyBudgetUsd: next.monthlyBudgetUsd,
        perJobBudgetUsd: next.perJobBudgetUsd,
        autoDowngrade: next.autoDowngrade,
        pauseOnBudgetExceeded: next.pauseOnBudgetExceeded
      },
      update: {
        provider: next.provider,
        summaryModel: next.summaryModel,
        translationModel: next.translationModel,
        askModel: next.askModel,
        newsletterModel: next.newsletterModel,
        monthlyBudgetUsd: next.monthlyBudgetUsd,
        perJobBudgetUsd: next.perJobBudgetUsd,
        autoDowngrade: next.autoDowngrade,
        pauseOnBudgetExceeded: next.pauseOnBudgetExceeded
      }
    });
    return aiConfigToDto(stored);
  }

  async updateUserSettings(username: string, patch: Partial<UserSettingsDto>) {
    const user = await this.requireUser(username);
    const allowed = {
      displayName: patch.displayName,
      language: patch.language,
      contentLanguageMode: patch.contentLanguageMode,
      vibePreset: patch.vibePreset,
      fontFamily: patch.fontFamily,
      fontScale: patch.fontScale,
      imageMode: patch.imageMode,
      themeMode: patch.themeMode,
      contentMode: patch.contentMode,
      newsletterEnabled: patch.newsletterEnabled,
      newsletterCadence: patch.newsletterCadence,
      askAiEnabled: patch.askAiEnabled,
      protectedModeEnabled: patch.protectedModeEnabled
    };
    await this.prisma.userSettings.upsert({
      where: {
        userId: user.id
      },
      create: {
        userId: user.id,
        displayName: allowed.displayName || username,
        language: allowed.language || 'en',
        contentLanguageMode: allowed.contentLanguageMode || 'single',
        vibePreset: allowed.vibePreset || 'museum',
        fontFamily: allowed.fontFamily || DEFAULT_FONT,
        fontScale: allowed.fontScale || 'md',
        imageMode: allowed.imageMode || 'on',
        themeMode: allowed.themeMode || 'light',
        contentMode: allowed.contentMode || 'standard',
        newsletterEnabled: allowed.newsletterEnabled || false,
        newsletterCadence: allowed.newsletterCadence || 'weekly',
        askAiEnabled: allowed.askAiEnabled ?? true,
        protectedModeEnabled: allowed.protectedModeEnabled ?? true
      },
      update: allowed
    });
    const updated = await this.prisma.user.findUnique({
      where: {
        id: user.id
      },
      include: {
        settings: true
      }
    });
    if (!updated) throw new Error('Account not found.');
    return buildUserDto(updated);
  }

  private async createSession(userId: string) {
    const token = `sess_${randomUUID()}`;
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    return token;
  }

  private async requireUser(username: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        username
      },
      include: {
        settings: true
      }
    });
    if (!user) throw new Error('Account not found.');
    return user;
  }

  private async getEffectiveAiConfig() {
    const row = await this.prisma.aiConfig.findUnique({
      where: {
        id: 1
      }
    });
    return row ? aiConfigToDto(row) : DEMO_AI_CONFIG;
  }

  private async getMonthlyAiSpendUsd() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const aggregate = await this.prisma.aiUsageLedger.aggregate({
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

  private async ensureCommunitySource(tx: Prisma.TransactionClient) {
    const existing = await tx.source.findUnique({
      where: {
        id: 'src-community-demo'
      }
    });
    if (existing) return existing;
    return tx.source.create({
      data: {
        id: 'src-community-demo',
        name: 'Fieldguide Community',
        slug: 'community',
        iconUrl: `${this.appUrl}/community-icon.png`,
        siteUrl: `${this.appUrl}/community`,
        description: 'Approved community submissions.',
        subjectsJson: JSON.stringify(['community']),
        language: 'en',
        defaultAudience: 'standard_only',
        sourceType: 'community',
        status: 'active',
        feeds: {
          create: {
            kind: 'custom',
            feedUrl: `${this.appUrl}/community/feed.xml`
          }
        }
      }
    });
  }

  private async ensureGeneratedStorySource(tx: Prisma.TransactionClient) {
    const existing = await tx.source.findUnique({
      where: {
        id: 'src-fieldguide-generated'
      }
    });
    if (existing) return existing;
    return tx.source.create({
      data: {
        id: 'src-fieldguide-generated',
        name: 'Fieldguide Generated Guides',
        slug: 'fieldguide-generated-guides',
        iconUrl: `${this.appUrl}/generated-story-icon.png`,
        siteUrl: `${this.appUrl}/admin/ai`,
        description: 'Admin-approved educational drafts generated from cited source material.',
        subjectsJson: JSON.stringify(['history', 'art', 'books', 'movies', 'country_knowledge', 'photography', 'nature', 'video']),
        language: 'en',
        defaultAudience: 'standard_only',
        sourceType: 'editorial',
        status: 'active',
        feeds: {
          create: {
            kind: 'custom',
            feedUrl: `${this.appUrl}/generated-stories/feed.xml`
          }
        }
      }
    });
  }

  private async findItem(idOrSlug: string, includeRemoved = false) {
    return this.prisma.contentItem.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug }
        ],
        ...(includeRemoved ? {} : { removedAt: null })
      },
      include: {
        source: {
          include: {
            feeds: true
          }
        },
        author: {
          include: {
            settings: true
          }
        },
        translations: true,
        tags: true
      }
    });
  }
}
