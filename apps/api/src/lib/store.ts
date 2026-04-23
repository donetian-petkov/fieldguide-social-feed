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
  UserRole,
  UserSettingsDto
} from '@edu-feed/shared';

export type RegisterInput = {
  username: string;
  displayName: string;
  password: string;
};

export type FeedResponse = {
  items: ContentItem[];
  pinnedItems: ContentItem[];
  savedIds: string[];
  hiddenIds: string[];
  mode: ContentMode;
  feed: SubjectFeed;
};

export type AdminSnapshot = {
  sources: SourceDefinition[];
  submissions: SubmissionDto[];
  users: UserSettingsDto[];
  items: ContentItem[];
  comments: CommentDto[];
  errorLogs: ErrorLogDto[];
  aiConfig: AiModelConfig;
  aiUsage: AiUsageSnapshot[];
};

export type ShareResult = {
  ok: boolean;
  shareUrl: string;
};

export type AskAiResult = {
  answer: string;
  citations: string[];
};

export type AlbumDetail = {
  album: AlbumDto;
  items: ContentItem[];
};

export type StoreResult<T> = T | Promise<T>;

export interface AppStore {
  listSources(): StoreResult<SourceDefinition[]>;
  getCurrentUser(sessionId?: string | null): StoreResult<UserSettingsDto | null>;
  register(input: RegisterInput): StoreResult<{ sessionId: string; user: UserSettingsDto }>;
  login(username: string, password: string): StoreResult<{ sessionId: string; user: UserSettingsDto }>;
  logout(sessionId?: string | null): StoreResult<void>;
  verifyPassword(username: string, password: string): StoreResult<string>;
  switchContentMode(username: string, nextMode: ContentMode, password?: string | null): StoreResult<ModeSwitchResult>;
  forgotPassword(identifier: string): StoreResult<{ ok: boolean; previewToken: string | null }>;
  resetPassword(token: string, nextPassword: string): StoreResult<{ ok: boolean }>;
  getFeed(query: FeedQuery, username?: string | null): StoreResult<FeedResponse>;
  getItem(idOrSlug: string, username?: string | null): StoreResult<ContentItem | null>;
  recordItemView(username: string, itemId: string): StoreResult<{ ok: boolean }>;
  getProfileItems(username: string): StoreResult<ContentItem[]>;
  listComments(itemId: string): StoreResult<CommentDto[]>;
  addComment(username: string, itemId: string, body: string): StoreResult<CommentDto>;
  hideItem(username: string, itemId: string): StoreResult<{ ok: boolean; hiddenIds: string[] }>;
  saveItem(username: string, itemId: string): StoreResult<{ ok: boolean; savedIds: string[] }>;
  unsaveItem(username: string, itemId: string): StoreResult<{ ok: boolean; savedIds: string[] }>;
  getAlbums(username: string): StoreResult<AlbumDto[]>;
  getAlbum(username: string, albumId: string): StoreResult<AlbumDetail | null>;
  createAlbum(username: string, title: string, description: string): StoreResult<AlbumDto>;
  updateAlbum(
    username: string,
    albumId: string,
    patch: Partial<Pick<AlbumDto, 'title' | 'description' | 'coverItemId' | 'itemIds'>>
  ): StoreResult<AlbumDto>;
  deleteAlbum(username: string, albumId: string): StoreResult<{ ok: boolean }>;
  addAlbumItem(username: string, albumId: string, itemId: string): StoreResult<AlbumDto>;
  createSubmission(
    username: string,
    input: { type: 'link' | 'community_post'; title: string; sourceUrl?: string | null; body?: string | null }
  ): StoreResult<SubmissionDto>;
  askAi(itemId: string, question: string, language: InterfaceLanguage, username?: string | null): StoreResult<AskAiResult>;
  shareItem(itemId: string): StoreResult<ShareResult>;
  getAdminSnapshot(): StoreResult<AdminSnapshot>;
  addSource(source: Omit<SourceDefinition, 'id'>): StoreResult<SourceDefinition>;
  updateSource(sourceId: string, patch: Partial<Omit<SourceDefinition, 'id'>>): StoreResult<SourceDefinition>;
  deleteSource(sourceId: string): StoreResult<{ ok: boolean }>;
  reviewSubmission(submissionId: string, decision: 'approved' | 'rejected'): StoreResult<{ submission: SubmissionDto; item: ContentItem | null }>;
  updateComment(username: string, commentId: string, body: string): StoreResult<CommentDto>;
  deleteComment(commentId: string, moderationNote?: string): StoreResult<CommentDto>;
  patchItem(
    itemId: string,
    patch: Partial<Pick<ContentItem, 'audience' | 'commentsLocked' | 'flags' | 'hiddenByDefault' | 'pinned'>>
  ): StoreResult<ContentItem>;
  removeItem(itemId: string, removed: boolean): StoreResult<ContentItem>;
  pinItem(itemId: string, slot: number): StoreResult<ContentItem>;
  lockComments(itemId: string, locked: boolean): StoreResult<ContentItem>;
  suspendUser(username: string, suspended: boolean): StoreResult<UserSettingsDto>;
  setUserRole(username: string, role: UserRole): StoreResult<UserSettingsDto>;
  updateAiConfig(patch: Partial<AiModelConfig>): StoreResult<AiModelConfig>;
  updateUserSettings(username: string, patch: Partial<UserSettingsDto>): StoreResult<UserSettingsDto>;
  disconnect?(): Promise<void>;
}
