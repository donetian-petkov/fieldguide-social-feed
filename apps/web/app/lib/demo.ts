import type {
  AlbumDto,
  CommentDto,
  ContentItem,
  ContentMode,
  InterfaceLanguage,
  SubjectFeed,
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
  SUBJECT_FEED_LABELS,
  filterItemsForFeed,
  resolveTranslation
} from '@edu-feed/shared';

const SAVED_BY_USER: Record<string, string[]> = {
  alex: ['item-sutton-hoo', 'item-book-riot', 'item-bulgaria'],
  admin: ['item-vermeer', 'item-nature'],
  mila: ['item-community']
};

export const demoViewer = DEMO_USERS.find((user) => user.username === 'alex') as UserSettingsDto;
export const demoAdmin = DEMO_USERS.find((user) => user.username === 'admin') as UserSettingsDto;

export const FEED_ORDER: SubjectFeed[] = [
  'history',
  'art',
  'books',
  'movies',
  'country-knowledge',
  'photography',
  'nature',
  'videos',
  'saved',
  'community'
];

export function normalizeFeedSegment(segment?: string): SubjectFeed {
  if (!segment) return 'history';
  if (segment === 'country-knowledge') return 'country-knowledge';
  if (segment === 'videos') return 'videos';
  if (segment === 'saved') return 'saved';
  if (segment === 'community') return 'community';
  if (segment === 'history' || segment === 'art' || segment === 'books' || segment === 'movies' || segment === 'photography' || segment === 'nature') {
    return segment;
  }
  return 'history';
}

export function getFeedModel(feed: SubjectFeed, options?: { language?: InterfaceLanguage; mode?: ContentMode; viewer?: UserSettingsDto }) {
  const viewer = options?.viewer || demoViewer;
  const language = options?.language || viewer.language;
  const mode = options?.mode || viewer.contentMode;
  const savedIds = SAVED_BY_USER[viewer.username] || [];
  const items = feed === 'saved' ? DEMO_ITEMS.filter((item) => savedIds.includes(item.id)) : filterItemsForFeed(DEMO_ITEMS, feed, mode);
  const pinnedItems = DEMO_PINNED_ITEMS.filter((entry) => entry.feed === feed)
    .map((entry) => DEMO_ITEMS.find((item) => item.id === entry.itemId))
    .filter(Boolean) as ContentItem[];

  return {
    feed,
    title: SUBJECT_FEED_LABELS[feed][language],
    subtitle:
      language === 'bg'
        ? 'Кратки образователни истории, подбрани за по-нататъшно четене.'
        : 'Compact educational stories selected to trigger deeper reading.',
    language,
    mode,
    viewer,
    savedIds,
    items,
    pinnedItems
  };
}

export function getItemModel(slug: string, language: InterfaceLanguage = demoViewer.language) {
  const item = DEMO_ITEMS.find((entry) => entry.slug === slug || entry.id === slug) || null;
  if (!item) return null;
  return {
    item,
    translation: resolveTranslation(item, language),
    comments: DEMO_COMMENTS.filter((comment) => comment.itemId === item.id),
    relatedItems: DEMO_ITEMS.filter((entry) => entry.id !== item.id && entry.subjects.some((subject) => item.subjects.includes(subject))).slice(0, 3)
  };
}

export function getAlbumModel(albumId: string) {
  const album = DEMO_ALBUMS.find((entry) => entry.id === albumId) || null;
  if (!album) return null;
  return {
    album,
    items: album.itemIds
      .map((id) => DEMO_ITEMS.find((entry) => entry.id === id))
      .filter(Boolean) as ContentItem[]
  };
}

export function getProfileModel(username: string) {
  const user = DEMO_USERS.find((entry) => entry.username === username) || (username === 'mila' ? {
    ...demoViewer,
    username: 'mila',
    displayName: 'Mila Petrova'
  } : null);
  if (!user) return null;
  return {
    user,
    items: DEMO_ITEMS.filter((item) => item.authorUsername === username)
  };
}

export function getAdminModel() {
  return {
    viewer: demoAdmin,
    sources: DEMO_SOURCES,
    submissions: DEMO_SUBMISSIONS,
    items: DEMO_ITEMS,
    comments: DEMO_COMMENTS,
    errorLogs: DEMO_ERROR_LOGS,
    aiConfig: DEMO_AI_CONFIG,
    aiUsage: DEMO_AI_USAGE,
    users: DEMO_USERS
  };
}

export function getSettingsModel() {
  return {
    viewer: demoViewer,
    savedCount: SAVED_BY_USER[demoViewer.username]?.length || 0,
    albums: DEMO_ALBUMS.filter((album) => album.ownerUsername === demoViewer.username)
  };
}

export function getCommentsCountByItem(itemId: string) {
  return DEMO_COMMENTS.filter((comment) => comment.itemId === itemId && !comment.deletedAt).length;
}

export function getSavedAlbumsForViewer() {
  return DEMO_ALBUMS.filter((album) => album.ownerUsername === demoViewer.username);
}

export function getPrimaryTranslation(item: ContentItem, language: InterfaceLanguage) {
  return resolveTranslation(item, language) || item.translations[0];
}

export function dualSummary(item: ContentItem) {
  return {
    en: resolveTranslation(item, 'en')?.summary || item.originalSummary,
    bg: resolveTranslation(item, 'bg')?.summary || item.originalSummary
  };
}

export function dualTitle(item: ContentItem) {
  return {
    en: resolveTranslation(item, 'en')?.title || item.originalTitle,
    bg: resolveTranslation(item, 'bg')?.title || item.originalTitle
  };
}

export function getAlbumCover(album: AlbumDto) {
  return DEMO_ITEMS.find((item) => item.id === album.coverItemId) || null;
}

export function getItemComments(itemId: string): CommentDto[] {
  return DEMO_COMMENTS.filter((comment) => comment.itemId === itemId);
}
