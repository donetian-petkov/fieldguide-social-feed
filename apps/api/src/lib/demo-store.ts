import { randomUUID } from 'node:crypto';

import type {
  AiModelConfig,
  AiUsageSnapshot,
  AlbumDto,
  CommentDto,
  ContentItem,
  ContentMode,
  ErrorLogDto,
  FeedQuery,
  InterfaceLanguage,
  ModeSwitchResult,
  SourceDefinition,
  SubjectFeed,
  SubmissionDto,
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

type RegisterInput = {
  username: string;
  displayName: string;
  password: string;
};

type FeedResponse = {
  items: ContentItem[];
  pinnedItems: ContentItem[];
  savedIds: string[];
  hiddenIds: string[];
  mode: ContentMode;
  feed: SubjectFeed;
};

type AdminSnapshot = {
  sources: SourceDefinition[];
  submissions: SubmissionDto[];
  users: UserSettingsDto[];
  items: ContentItem[];
  comments: CommentDto[];
  errorLogs: ErrorLogDto[];
  aiConfig: AiModelConfig;
  aiUsage: AiUsageSnapshot[];
};

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

  private sessions = new Map<string, DemoSession>();

  private resetTokens = new Map<string, ResetTokenRecord>();

  private modeVerifications = new Map<string, ModeVerificationRecord>();

  private savedByUser = new Map<string, Set<string>>([
    ['alex', new Set(['item-sutton-hoo', 'item-book-riot', 'item-bulgaria'])],
    ['admin', new Set(['item-vermeer', 'item-nature'])]
  ]);

  private hiddenByUser = new Map<string, Set<string>>([
    ['alex', new Set()],
    ['admin', new Set()]
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

  constructor(options: { sessionTtlHours: number; modeSwitchTtlMinutes: number; appUrl: string }) {
    this.sessionTtlMs = options.sessionTtlHours * 60 * 60 * 1000;
    this.modeSwitchTtlMs = options.modeSwitchTtlMinutes * 60 * 1000;
    this.appUrl = options.appUrl.replace(/\/$/, '');

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
        askAiEnabled: true,
        protectedModeEnabled: true
      });
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
      askAiEnabled: true,
      protectedModeEnabled: true
    };
    this.users.push(nextUser);
    this.credentials.set(username, input.password);
    this.userEmails.set(username, `${username}@example.com`);
    this.savedByUser.set(username, new Set());
    this.hiddenByUser.set(username, new Set());
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

    items = items.sort((left, right) => +new Date(right.publishedAt) - +new Date(left.publishedAt));

    const pinnedIds = this.pinnedSlots.filter((entry) => entry.feed === query.feed).map((entry) => entry.itemId);
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

  getProfileItems(username: string) {
    return this.items.filter((item) => item.authorUsername === username && !this.removedItemIds.has(item.id));
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
    saved.add(itemId);
    this.savedByUser.set(username, saved);
    return { ok: true, savedIds: [...saved] };
  }

  unsaveItem(username: string, itemId: string) {
    const saved = this.savedByUser.get(username) || new Set<string>();
    saved.delete(itemId);
    this.savedByUser.set(username, saved);
    return { ok: true, savedIds: [...saved] };
  }

  getAlbums(username: string) {
    return this.albums.filter((album) => album.ownerUsername === username);
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
    const submission: SubmissionDto = {
      id: `submission-${randomUUID()}`,
      type: input.type,
      title: input.title,
      sourceUrl: input.sourceUrl || null,
      body: input.body || null,
      submittedBy: username,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    this.submissions.unshift(submission);
    return submission;
  }

  askAi(itemId: string, question: string, language: InterfaceLanguage) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    const translation = resolveTranslation(item, language);
    const answer =
      language === 'bg'
        ? `За "${translation?.title}" бих започнал с произхода на източника, ключовия аргумент и какви допълнителни първични или музейни материали можеш да потърсиш. Въпросът ти беше: ${question}`
        : `For "${translation?.title}", start with the source context, the central claim, and which museum, archive, or primary materials could deepen the story. Your question was: ${question}`;

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

  getAdminSnapshot(): AdminSnapshot {
    return {
      sources: this.sources,
      submissions: this.submissions,
      users: this.users,
      items: this.items,
      comments: this.comments,
      errorLogs: this.errorLogs,
      aiConfig: this.aiConfig,
      aiUsage: this.aiUsage
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
          externalUrl: submission.sourceUrl,
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
    return item;
  }

  removeItem(itemId: string, removed: boolean) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    item.removedAt = removed ? new Date().toISOString() : null;
    if (removed) {
      this.removedItemIds.add(itemId);
      item.pinned = false;
    } else {
      this.removedItemIds.delete(itemId);
    }
    return item;
  }

  pinItem(itemId: string, slot: number) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found.');
    item.pinned = true;
    const existingSlot = this.pinnedSlots.find((entry) => entry.slot === slot);
    if (existingSlot) existingSlot.itemId = itemId;
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
