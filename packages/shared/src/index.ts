import { z } from 'zod';

export const interfaceLanguageSchema = z.enum(['en', 'bg']);
export const contentLanguageModeSchema = z.enum(['single', 'dual']);
export const themeModeSchema = z.enum(['light', 'dark', 'system']);
export const contentModeSchema = z.enum(['kid', 'standard', 'adult']);
export const userRoleSchema = z.enum(['user', 'admin']);
export const contentKindSchema = z.enum(['external_article', 'youtube_video', 'community_post']);
export const feedKindSchema = z.enum(['rss', 'youtube', 'custom']);
export const sourceStatusSchema = z.enum(['active', 'paused', 'error']);
export const audienceLabelSchema = z.enum(['kid_safe', 'standard_only', 'adult_only']);
export const moderationFlagSchema = z.enum([
  'nsfw',
  'spoiler',
  'not_verified',
  'gore',
  'sensitive_history'
]);
export const subjectTagSchema = z.enum([
  'history',
  'art',
  'books',
  'movies',
  'country_knowledge',
  'photography',
  'nature',
  'video',
  'community'
]);
export const vibePresetSchema = z.enum([
  'museum',
  'archive',
  'field_notes',
  'cinema',
  'naturalist'
]);
export const aiProviderSchema = z.enum(['openai', 'anthropic', 'openrouter']);
export const aiBudgetModeSchema = z.enum(['low', 'standard', 'high']);
export const sourceTypeSchema = z.enum(['editorial', 'community', 'adult_educational']);
export const submissionStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const subjectFeedSchema = z.enum([
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
]);

export const translationSchema = z.object({
  language: interfaceLanguageSchema,
  title: z.string(),
  summary: z.string(),
  slug: z.string()
});

export const sourceDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  iconUrl: z.string().url(),
  siteUrl: z.string().url(),
  feedUrl: z.string().url(),
  kind: feedKindSchema,
  status: sourceStatusSchema,
  sourceType: sourceTypeSchema,
  subjects: z.array(subjectTagSchema).min(1),
  defaultAudience: audienceLabelSchema,
  language: interfaceLanguageSchema,
  description: z.string()
});

export const contentTagSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['subject', 'flag', 'audience', 'meta']),
  value: z.string()
});

export const contentItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: contentKindSchema,
  sourceId: z.string(),
  sourceName: z.string(),
  sourceIconUrl: z.string().url(),
  sourceUrl: z.string().url(),
  authorUsername: z.string().nullable(),
  publishedAt: z.string(),
  originalTitle: z.string(),
  originalSummary: z.string(),
  coverImageUrl: z.string().url(),
  externalUrl: z.string().url().nullable(),
  youtubeVideoId: z.string().nullable(),
  subject: subjectTagSchema,
  subjects: z.array(subjectTagSchema).min(1),
  flags: z.array(moderationFlagSchema),
  audience: audienceLabelSchema,
  pinned: z.boolean(),
  commentsLocked: z.boolean(),
  hiddenByDefault: z.boolean(),
  translations: z.array(translationSchema),
  tags: z.array(contentTagSchema),
  bodyMarkdown: z.string().nullable(),
  ai: z.object({
    summaryProvider: aiProviderSchema,
    summaryModel: z.string(),
    translationProvider: aiProviderSchema,
    translationModel: z.string()
  })
});

export const pinnedItemSchema = z.object({
  slot: z.number().int().nonnegative(),
  itemId: z.string(),
  feed: subjectFeedSchema
});

export const commentDtoSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  authorUsername: z.string(),
  authorDisplayName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  moderationNote: z.string().nullable()
});

export const albumDtoSchema = z.object({
  id: z.string(),
  ownerUsername: z.string(),
  title: z.string(),
  description: z.string(),
  coverItemId: z.string().nullable(),
  itemIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const userSettingsDtoSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  role: userRoleSchema,
  language: interfaceLanguageSchema,
  contentLanguageMode: contentLanguageModeSchema,
  vibePreset: vibePresetSchema,
  fontFamily: z.string(),
  fontScale: z.enum(['sm', 'md', 'lg']),
  imageMode: z.enum(['on', 'off']),
  themeMode: themeModeSchema,
  contentMode: contentModeSchema,
  newsletterEnabled: z.boolean(),
  askAiEnabled: z.boolean(),
  protectedModeEnabled: z.boolean()
});

export const feedQuerySchema = z.object({
  feed: subjectFeedSchema.default('history'),
  language: interfaceLanguageSchema.default('en'),
  contentMode: contentModeSchema.default('standard'),
  includePinned: z.boolean().default(true),
  includeHidden: z.boolean().default(false),
  search: z.string().trim().optional()
});

export const modeSwitchRequestSchema = z.object({
  nextMode: contentModeSchema,
  password: z.string().min(8)
});

export const modeSwitchResultSchema = z.object({
  ok: z.boolean(),
  nextMode: contentModeSchema,
  verifiedUntil: z.string().nullable()
});

export const aiModelConfigSchema = z.object({
  provider: aiProviderSchema,
  summaryModel: z.string(),
  translationModel: z.string(),
  askModel: z.string(),
  newsletterModel: z.string(),
  monthlyBudgetUsd: z.number().nonnegative(),
  perJobBudgetUsd: z.number().nonnegative(),
  autoDowngrade: z.boolean(),
  pauseOnBudgetExceeded: z.boolean()
});

export const aiUsageSnapshotSchema = z.object({
  provider: aiProviderSchema,
  model: z.string(),
  purpose: z.enum(['summary', 'translation', 'classification', 'ask', 'newsletter']),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  createdAt: z.string()
});

export const submissionDtoSchema = z.object({
  id: z.string(),
  type: z.enum(['link', 'community_post']),
  title: z.string(),
  sourceUrl: z.string().url().nullable(),
  body: z.string().nullable(),
  submittedBy: z.string(),
  status: submissionStatusSchema,
  createdAt: z.string()
});

export const errorLogDtoSchema = z.object({
  id: z.string(),
  scope: z.enum(['api', 'worker', 'ingestion', 'email', 'ai']),
  message: z.string(),
  level: z.enum(['error', 'warn']),
  createdAt: z.string(),
  resolvedAt: z.string().nullable()
});

export type InterfaceLanguage = z.infer<typeof interfaceLanguageSchema>;
export type ContentLanguageMode = z.infer<typeof contentLanguageModeSchema>;
export type ThemeMode = z.infer<typeof themeModeSchema>;
export type ContentMode = z.infer<typeof contentModeSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type ContentKind = z.infer<typeof contentKindSchema>;
export type FeedKind = z.infer<typeof feedKindSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type AudienceLabel = z.infer<typeof audienceLabelSchema>;
export type ModerationFlag = z.infer<typeof moderationFlagSchema>;
export type SubjectTag = z.infer<typeof subjectTagSchema>;
export type VibePreset = z.infer<typeof vibePresetSchema>;
export type AIProvider = z.infer<typeof aiProviderSchema>;
export type AIBudgetMode = z.infer<typeof aiBudgetModeSchema>;
export type SubjectFeed = z.infer<typeof subjectFeedSchema>;
export type SourceDefinition = z.infer<typeof sourceDefinitionSchema>;
export type ContentTag = z.infer<typeof contentTagSchema>;
export type ContentItem = z.infer<typeof contentItemSchema>;
export type PinnedItem = z.infer<typeof pinnedItemSchema>;
export type CommentDto = z.infer<typeof commentDtoSchema>;
export type AlbumDto = z.infer<typeof albumDtoSchema>;
export type UserSettingsDto = z.infer<typeof userSettingsDtoSchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type ModeSwitchRequest = z.infer<typeof modeSwitchRequestSchema>;
export type ModeSwitchResult = z.infer<typeof modeSwitchResultSchema>;
export type AiModelConfig = z.infer<typeof aiModelConfigSchema>;
export type AiUsageSnapshot = z.infer<typeof aiUsageSnapshotSchema>;
export type SubmissionDto = z.infer<typeof submissionDtoSchema>;
export type ErrorLogDto = z.infer<typeof errorLogDtoSchema>;

export const SUBJECT_FEED_LABELS: Record<SubjectFeed, { en: string; bg: string }> = {
  history: { en: 'History', bg: 'История' },
  art: { en: 'Art', bg: 'Изкуство' },
  books: { en: 'Books', bg: 'Книги' },
  movies: { en: 'Movies', bg: 'Кино' },
  'country-knowledge': { en: 'Country Knowledge', bg: 'Познание за държави' },
  photography: { en: 'Photography', bg: 'Фотография' },
  nature: { en: 'Nature', bg: 'Природа' },
  videos: { en: 'Videos', bg: 'Видео' },
  saved: { en: 'Saved', bg: 'Запазени' },
  community: { en: 'Community', bg: 'Общност' }
};

export const CONTENT_MODE_LABELS: Record<ContentMode, { en: string; bg: string }> = {
  kid: { en: 'Kid', bg: 'Детски' },
  standard: { en: 'Standard', bg: 'Стандартен' },
  adult: { en: 'Adult', bg: 'Възрастни' }
};

export const PRESET_FONT_STACKS: Record<VibePreset, string> = {
  museum: '"Fraunces", "Georgia", serif',
  archive: '"IBM Plex Sans", "Helvetica Neue", sans-serif',
  field_notes: '"Manrope", "Helvetica Neue", sans-serif',
  cinema: '"Sora", "Helvetica Neue", sans-serif',
  naturalist: '"Cormorant Garamond", "Georgia", serif'
};

export const DEMO_SOURCES: SourceDefinition[] = [
  {
    id: 'src-world-history',
    name: 'World History Encyclopedia',
    slug: 'world-history-encyclopedia',
    iconUrl: 'https://www.worldhistory.org/uploads/images/website-logo.png?v=1',
    siteUrl: 'https://www.worldhistory.org/',
    feedUrl: 'https://www.worldhistory.org/rss/latest.xml',
    kind: 'rss',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['history'],
    defaultAudience: 'kid_safe',
    language: 'en',
    description: 'Global history explainers, artifacts, and timelines.'
  },
  {
    id: 'src-smarthistory',
    name: 'Smarthistory',
    slug: 'smarthistory',
    iconUrl: 'https://smarthistory.org/wp-content/uploads/2020/02/cropped-SH-favicon-270x270.png',
    siteUrl: 'https://smarthistory.org/',
    feedUrl: 'https://smarthistory.org/feed/',
    kind: 'rss',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['art', 'history'],
    defaultAudience: 'kid_safe',
    language: 'en',
    description: 'Art history essays and teaching resources.'
  },
  {
    id: 'src-book-riot',
    name: 'Book Riot',
    slug: 'book-riot',
    iconUrl: 'https://bookriot.com/wp-content/uploads/2022/09/cropped-bookriotfavicon-192x192.png',
    siteUrl: 'https://bookriot.com/',
    feedUrl: 'https://bookriot.com/feed/',
    kind: 'rss',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['books'],
    defaultAudience: 'standard_only',
    language: 'en',
    description: 'Books, reading culture, and literary discovery.'
  },
  {
    id: 'src-screen-daily',
    name: 'Screen Daily',
    slug: 'screen-daily',
    iconUrl: 'https://www.screendaily.com/img/screendaily/favicon-32x32.png',
    siteUrl: 'https://www.screendaily.com/',
    feedUrl: 'https://www.screendaily.com/full-rss',
    kind: 'rss',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['movies'],
    defaultAudience: 'standard_only',
    language: 'en',
    description: 'Film industry reporting and festival coverage.'
  },
  {
    id: 'src-atlas-obscura',
    name: 'Atlas Obscura',
    slug: 'atlas-obscura',
    iconUrl: 'https://www.atlasobscura.com/favicon.ico',
    siteUrl: 'https://www.atlasobscura.com/',
    feedUrl: 'https://www.atlasobscura.com/feeds/latest',
    kind: 'rss',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['country_knowledge', 'history', 'nature'],
    defaultAudience: 'kid_safe',
    language: 'en',
    description: 'Curiosities, geography, traditions, and hidden places.'
  },
  {
    id: 'src-petapixel',
    name: 'PetaPixel',
    slug: 'petapixel',
    iconUrl: 'https://petapixel.com/assets/uploads/2019/05/favicon.png',
    siteUrl: 'https://petapixel.com/',
    feedUrl: 'https://petapixel.com/feed/',
    kind: 'rss',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['photography'],
    defaultAudience: 'standard_only',
    language: 'en',
    description: 'Photography techniques, gear, and visual culture.'
  },
  {
    id: 'src-radio-bulgaria',
    name: 'Radio Bulgaria',
    slug: 'radio-bulgaria',
    iconUrl: 'https://bnr.bg/Content/img/favicon.ico',
    siteUrl: 'https://bnr.bg/en/',
    feedUrl: 'https://bnr.bg/en/rss',
    kind: 'rss',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['country_knowledge', 'history', 'art'],
    defaultAudience: 'kid_safe',
    language: 'bg',
    description: 'Bulgarian culture, society, and heritage in English and Bulgarian.'
  },
  {
    id: 'src-crash-course',
    name: 'Crash Course',
    slug: 'crash-course',
    iconUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_ny6YObYbQTuZgVtr1KdlIqLJfP6ZK5T7JebdR0hQ=s176-c-k-c0x00ffffff-no-rj',
    siteUrl: 'https://thecrashcourse.com/',
    feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCX6b17PVsYBQ0ip5gyeme-Q',
    kind: 'youtube',
    status: 'active',
    sourceType: 'editorial',
    subjects: ['video', 'history', 'books', 'nature'],
    defaultAudience: 'kid_safe',
    language: 'en',
    description: 'Educational video essays across science, history, and culture.'
  },
  {
    id: 'src-community-demo',
    name: 'Community',
    slug: 'community',
    iconUrl: 'https://dummyimage.com/128x128/111111/ffffff.png&text=C',
    siteUrl: 'https://fieldguide.local/community',
    feedUrl: 'https://fieldguide.local/community/feed.xml',
    kind: 'custom',
    status: 'active',
    sourceType: 'community',
    subjects: ['community'],
    defaultAudience: 'standard_only',
    language: 'en',
    description: 'Approved user-contributed reading paths, essays, and links.'
  },
  {
    id: 'src-sex-positive',
    name: 'Sex Positive Journal',
    slug: 'sex-positive-journal',
    iconUrl: 'https://dummyimage.com/128x128/f08c68/ffffff.png&text=SP',
    siteUrl: 'https://example.com/sex-positive-journal',
    feedUrl: 'https://example.com/sex-positive-journal/feed.xml',
    kind: 'custom',
    status: 'paused',
    sourceType: 'adult_educational',
    subjects: ['community', 'books'],
    defaultAudience: 'adult_only',
    language: 'en',
    description: 'Placeholder adult educational source for the protected adult mode.'
  }
];

export const DEMO_ITEMS: ContentItem[] = [
  {
    id: 'item-sutton-hoo',
    slug: 'sutton-hoo-ship-burial-returns-to-the-feed',
    kind: 'external_article',
    sourceId: 'src-world-history',
    sourceName: 'World History Encyclopedia',
    sourceIconUrl: 'https://www.worldhistory.org/uploads/images/website-logo.png?v=1',
    sourceUrl: 'https://www.worldhistory.org/',
    authorUsername: null,
    publishedAt: '2025-04-10T09:00:00.000Z',
    originalTitle: 'What the Sutton Hoo ship burial still teaches us about early medieval power',
    originalSummary: 'A concise look at the objects, rituals, and political imagination around Sutton Hoo, with enough context to invite deeper reading.',
    coverImageUrl: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://www.worldhistory.org/article/0000/sutton-hoo-ship-burial/',
    youtubeVideoId: null,
    subject: 'history',
    subjects: ['history'],
    flags: [],
    audience: 'kid_safe',
    pinned: true,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'What the Sutton Hoo ship burial still teaches us about early medieval power',
        summary: 'A short field guide to why Sutton Hoo matters: power, ritual, craftsmanship, and the stories archaeologists can still recover from a single burial landscape.',
        slug: 'sutton-hoo-ship-burial-returns-to-the-feed'
      },
      {
        language: 'bg',
        title: 'Какво още ни учи погребението със кораб в Сътън Ху за ранносредновековната власт',
        summary: 'Кратък пътеводител защо Сътън Ху е важен: власт, ритуал, майсторство и историите, които археолозите все още възстановяват от един погребален пейзаж.',
        slug: 'sutton-hoo-ship-burial-returns-to-the-feed-bg'
      }
    ],
    tags: [
      { id: 'tag-history-1', label: 'History', type: 'subject', value: 'history' },
      { id: 'tag-audience-1', label: 'Kid Safe', type: 'audience', value: 'kid_safe' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-vermeer',
    slug: 'how-vermeer-builds-silence-through-light',
    kind: 'external_article',
    sourceId: 'src-smarthistory',
    sourceName: 'Smarthistory',
    sourceIconUrl: 'https://smarthistory.org/wp-content/uploads/2020/02/cropped-SH-favicon-270x270.png',
    sourceUrl: 'https://smarthistory.org/',
    authorUsername: null,
    publishedAt: '2025-04-11T08:00:00.000Z',
    originalTitle: 'How Vermeer builds silence through light',
    originalSummary: 'A readable art-history note on how light, domestic scale, and staging shape the emotional temperature of Vermeer’s paintings.',
    coverImageUrl: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://smarthistory.org/vermeer-light/',
    youtubeVideoId: null,
    subject: 'art',
    subjects: ['art', 'history'],
    flags: [],
    audience: 'kid_safe',
    pinned: true,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'How Vermeer builds silence through light',
        summary: 'This summary tracks the quiet engineering of a Vermeer interior: window light, measured geometry, and tiny material details that make calm feel almost architectural.',
        slug: 'how-vermeer-builds-silence-through-light'
      },
      {
        language: 'bg',
        title: 'Как Вермеер изгражда тишина чрез светлина',
        summary: 'Това резюме проследява тихата конструкция на интериора при Вермеер: светлина от прозореца, премерена геометрия и малки материални детайли, които правят спокойствието почти архитектурно.',
        slug: 'how-vermeer-builds-silence-through-light-bg'
      }
    ],
    tags: [
      { id: 'tag-art-1', label: 'Art', type: 'subject', value: 'art' },
      { id: 'tag-history-2', label: 'History', type: 'subject', value: 'history' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-book-riot',
    slug: 'reading-maps-that-turn-countries-into-stories',
    kind: 'external_article',
    sourceId: 'src-book-riot',
    sourceName: 'Book Riot',
    sourceIconUrl: 'https://bookriot.com/wp-content/uploads/2022/09/cropped-bookriotfavicon-192x192.png',
    sourceUrl: 'https://bookriot.com/',
    authorUsername: null,
    publishedAt: '2025-04-12T10:30:00.000Z',
    originalTitle: 'Reading maps that turn countries into stories',
    originalSummary: 'A curated reading list where atlases, memoir, and narrative nonfiction intersect to make geography feel lived rather than abstract.',
    coverImageUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://bookriot.com/maps-and-reading-list/',
    youtubeVideoId: null,
    subject: 'books',
    subjects: ['books', 'country_knowledge'],
    flags: [],
    audience: 'standard_only',
    pinned: false,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'Reading maps that turn countries into stories',
        summary: 'A one-paragraph guide to books where maps are not decorations but narrative engines, helping readers move from place names to memory, borders, and lived experience.',
        slug: 'reading-maps-that-turn-countries-into-stories'
      },
      {
        language: 'bg',
        title: 'Карти за четене, които превръщат държавите в истории',
        summary: 'Кратък ориентир към книги, в които картите не са украса, а двигател на разказа и помагат на читателя да премине от имена на места към памет, граници и жив опит.',
        slug: 'reading-maps-that-turn-countries-into-stories-bg'
      }
    ],
    tags: [
      { id: 'tag-books-1', label: 'Books', type: 'subject', value: 'books' },
      { id: 'tag-country-1', label: 'Country Knowledge', type: 'subject', value: 'country_knowledge' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-festival',
    slug: 'why-festival-programming-shapes-what-film-history-remembers',
    kind: 'external_article',
    sourceId: 'src-screen-daily',
    sourceName: 'Screen Daily',
    sourceIconUrl: 'https://www.screendaily.com/img/screendaily/favicon-32x32.png',
    sourceUrl: 'https://www.screendaily.com/',
    authorUsername: null,
    publishedAt: '2025-04-13T11:15:00.000Z',
    originalTitle: 'Why festival programming shapes what film history remembers',
    originalSummary: 'An industry-facing article that also works as a primer on how canon formation happens through gatekeeping, discovery, and distribution.',
    coverImageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://www.screendaily.com/features/festival-programming-memory/',
    youtubeVideoId: null,
    subject: 'movies',
    subjects: ['movies', 'history'],
    flags: ['spoiler'],
    audience: 'standard_only',
    pinned: false,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'Why festival programming shapes what film history remembers',
        summary: 'This summary explains how festivals influence the films audiences discover, the reputations critics stabilize, and the historical record that later feels inevitable.',
        slug: 'why-festival-programming-shapes-what-film-history-remembers'
      },
      {
        language: 'bg',
        title: 'Защо фестивалното програмиране оформя това, което филмовата история помни',
        summary: 'Това резюме обяснява как фестивалите влияят върху филмите, които публиката открива, върху репутациите, които критиците стабилизират, и върху историческия запис, който по-късно изглежда неизбежен.',
        slug: 'why-festival-programming-shapes-what-film-history-remembers-bg'
      }
    ],
    tags: [
      { id: 'tag-movies-1', label: 'Movies', type: 'subject', value: 'movies' },
      { id: 'tag-spoiler-1', label: 'Spoiler', type: 'flag', value: 'spoiler' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-bulgaria',
    slug: 'the-bell-rhythms-of-kukeri-season',
    kind: 'external_article',
    sourceId: 'src-radio-bulgaria',
    sourceName: 'Radio Bulgaria',
    sourceIconUrl: 'https://bnr.bg/Content/img/favicon.ico',
    sourceUrl: 'https://bnr.bg/en/',
    authorUsername: null,
    publishedAt: '2025-04-14T07:50:00.000Z',
    originalTitle: 'The bell rhythms of Kukeri season',
    originalSummary: 'A short cultural primer on masks, sound, costume, and seasonal ritual in Bulgaria, written to invite follow-up reading and listening.',
    coverImageUrl: 'https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://bnr.bg/en/post/102000000/the-bell-rhythms-of-kukeri-season',
    youtubeVideoId: null,
    subject: 'country_knowledge',
    subjects: ['country_knowledge', 'history', 'art'],
    flags: [],
    audience: 'kid_safe',
    pinned: true,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'The bell rhythms of Kukeri season',
        summary: 'An approachable introduction to the Kukeri tradition, focusing on sound, costume, and communal performance as a living cultural archive rather than a frozen folklore display.',
        slug: 'the-bell-rhythms-of-kukeri-season'
      },
      {
        language: 'bg',
        title: 'Ритмите на чановете през кукерския сезон',
        summary: 'Достъпно въведение в кукерската традиция, което разглежда звука, костюма и общностното изпълнение като жив културен архив, а не като застинал фолклор.',
        slug: 'the-bell-rhythms-of-kukeri-season-bg'
      }
    ],
    tags: [
      { id: 'tag-country-2', label: 'Country Knowledge', type: 'subject', value: 'country_knowledge' },
      { id: 'tag-art-2', label: 'Art', type: 'subject', value: 'art' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-photo',
    slug: 'why-rain-and-reflection-still-matter-in-street-photography',
    kind: 'external_article',
    sourceId: 'src-petapixel',
    sourceName: 'PetaPixel',
    sourceIconUrl: 'https://petapixel.com/assets/uploads/2019/05/favicon.png',
    sourceUrl: 'https://petapixel.com/',
    authorUsername: null,
    publishedAt: '2025-04-15T13:45:00.000Z',
    originalTitle: 'Why rain and reflection still matter in street photography',
    originalSummary: 'A practical piece about visual rhythm, patience, and atmosphere that still lands as educational reading even if you never pick up a camera.',
    coverImageUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://petapixel.com/rain-reflection-street-photography',
    youtubeVideoId: null,
    subject: 'photography',
    subjects: ['photography', 'art'],
    flags: [],
    audience: 'standard_only',
    pinned: false,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'Why rain and reflection still matter in street photography',
        summary: 'This summary turns a technique article into a quick lesson on patience, framing, weather, and how atmosphere changes what a city scene says.',
        slug: 'why-rain-and-reflection-still-matter-in-street-photography'
      },
      {
        language: 'bg',
        title: 'Защо дъждът и отражението все още имат значение в уличната фотография',
        summary: 'Това резюме превръща техническа статия в кратък урок по търпение, кадриране, време и начините, по които атмосферата променя смисъла на градската сцена.',
        slug: 'why-rain-and-reflection-still-matter-in-street-photography-bg'
      }
    ],
    tags: [
      { id: 'tag-photo-1', label: 'Photography', type: 'subject', value: 'photography' },
      { id: 'tag-art-3', label: 'Art', type: 'subject', value: 'art' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-nature',
    slug: 'migratory-birds-and-the-hidden-architecture-of-rest-stops',
    kind: 'youtube_video',
    sourceId: 'src-crash-course',
    sourceName: 'Crash Course',
    sourceIconUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_ny6YObYbQTuZgVtr1KdlIqLJfP6ZK5T7JebdR0hQ=s176-c-k-c0x00ffffff-no-rj',
    sourceUrl: 'https://thecrashcourse.com/',
    authorUsername: null,
    publishedAt: '2025-04-16T16:20:00.000Z',
    originalTitle: 'Migratory birds and the hidden architecture of rest stops',
    originalSummary: 'A video-led explanation of migration corridors, habitat stress, and why apparently empty spaces can be ecologically essential.',
    coverImageUrl: 'https://images.unsplash.com/photo-1501706362039-c6e80948bb84?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://www.youtube.com/watch?v=abc123nature',
    youtubeVideoId: 'abc123nature',
    subject: 'nature',
    subjects: ['nature', 'video'],
    flags: [],
    audience: 'kid_safe',
    pinned: false,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'Migratory birds and the hidden architecture of rest stops',
        summary: 'A compact explanation of why migratory species depend on a chain of fragile stopover habitats and what happens when even one link in that chain disappears.',
        slug: 'migratory-birds-and-the-hidden-architecture-of-rest-stops'
      },
      {
        language: 'bg',
        title: 'Прелетните птици и скритата архитектура на местата за отдих',
        summary: 'Кратко обяснение защо прелетните видове зависят от верига от крехки междинни местообитания и какво се случва, когато дори една връзка от нея изчезне.',
        slug: 'migratory-birds-and-the-hidden-architecture-of-rest-stops-bg'
      }
    ],
    tags: [
      { id: 'tag-nature-1', label: 'Nature', type: 'subject', value: 'nature' },
      { id: 'tag-video-1', label: 'Video', type: 'subject', value: 'video' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-community',
    slug: 'a-reading-path-through-balkan-cinema-posters',
    kind: 'community_post',
    sourceId: 'src-community-demo',
    sourceName: 'Community',
    sourceIconUrl: 'https://dummyimage.com/128x128/111111/ffffff.png&text=C',
    sourceUrl: 'https://fieldguide.local/community',
    authorUsername: 'mila',
    publishedAt: '2025-04-17T12:00:00.000Z',
    originalTitle: 'A reading path through Balkan cinema posters',
    originalSummary: 'A user-created guide that links poster design, film history, and local printing aesthetics into a compact learning path.',
    coverImageUrl: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?auto=format&fit=crop&w=1200&q=80',
    externalUrl: null,
    youtubeVideoId: null,
    subject: 'community',
    subjects: ['community', 'movies', 'art'],
    flags: ['not_verified'],
    audience: 'standard_only',
    pinned: false,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'A reading path through Balkan cinema posters',
        summary: 'This approved community post suggests a small syllabus: poster archives, print history, and film essays that make visual design part of historical reading.',
        slug: 'a-reading-path-through-balkan-cinema-posters'
      },
      {
        language: 'bg',
        title: 'Пътека за четене през плакатите на балканското кино',
        summary: 'Тази одобрена общностна публикация предлага малка програма: плакатни архиви, история на печата и филмови есета, които превръщат визуалния дизайн в част от историческото четене.',
        slug: 'a-reading-path-through-balkan-cinema-posters-bg'
      }
    ],
    tags: [
      { id: 'tag-community-1', label: 'Community', type: 'subject', value: 'community' },
      { id: 'tag-not-verified-1', label: 'Not Verified', type: 'flag', value: 'not_verified' }
    ],
    bodyMarkdown: '## Why posters matter\n\nFilm posters compress distribution, politics, typography, and public taste into one object. This post collects starting points for further research across Balkan archives and essays.',
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  },
  {
    id: 'item-adult',
    slug: 'sex-education-reading-list-on-consent-and-language',
    kind: 'external_article',
    sourceId: 'src-sex-positive',
    sourceName: 'Sex Positive Journal',
    sourceIconUrl: 'https://dummyimage.com/128x128/f08c68/ffffff.png&text=SP',
    sourceUrl: 'https://example.com/sex-positive-journal',
    authorUsername: null,
    publishedAt: '2025-04-18T18:00:00.000Z',
    originalTitle: 'Sex-education reading list on consent and language',
    originalSummary: 'A placeholder adult-mode educational item covering consent, vocabulary, and respectful communication.',
    coverImageUrl: 'https://images.unsplash.com/photo-1516589091380-5d8e87df6999?auto=format&fit=crop&w=1200&q=80',
    externalUrl: 'https://example.com/sex-positive-journal/consent-reading-list',
    youtubeVideoId: null,
    subject: 'books',
    subjects: ['books', 'community'],
    flags: ['nsfw'],
    audience: 'adult_only',
    pinned: false,
    commentsLocked: false,
    hiddenByDefault: false,
    translations: [
      {
        language: 'en',
        title: 'Sex-education reading list on consent and language',
        summary: 'This adult-mode item frames consent as a literacy question: vocabulary, boundaries, and reflective reading that centers clarity and respect.',
        slug: 'sex-education-reading-list-on-consent-and-language'
      },
      {
        language: 'bg',
        title: 'Списък за четене по сексуално образование за съгласие и език',
        summary: 'Този материал за режим за възрастни разглежда съгласието като въпрос на грамотност: речник, граници и четене, насочено към яснота и уважение.',
        slug: 'sex-education-reading-list-on-consent-and-language-bg'
      }
    ],
    tags: [
      { id: 'tag-adult-1', label: 'Adult Only', type: 'audience', value: 'adult_only' },
      { id: 'tag-nsfw-1', label: 'NSFW', type: 'flag', value: 'nsfw' }
    ],
    bodyMarkdown: null,
    ai: {
      summaryProvider: 'openai',
      summaryModel: 'gpt-4.1-mini',
      translationProvider: 'openai',
      translationModel: 'gpt-4.1-mini'
    }
  }
];

export const DEMO_PINNED_ITEMS: PinnedItem[] = [
  { slot: 0, itemId: 'item-sutton-hoo', feed: 'history' },
  { slot: 1, itemId: 'item-vermeer', feed: 'art' },
  { slot: 2, itemId: 'item-bulgaria', feed: 'country-knowledge' }
];

export const DEMO_COMMENTS: CommentDto[] = [
  {
    id: 'comment-1',
    itemId: 'item-sutton-hoo',
    authorUsername: 'alex',
    authorDisplayName: 'Alex Marin',
    body: 'The summary is concise, but the burial goods section made me want a timeline view too.',
    createdAt: '2025-04-10T12:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    moderationNote: null
  },
  {
    id: 'comment-2',
    itemId: 'item-community',
    authorUsername: 'mila',
    authorDisplayName: 'Mila Petrova',
    body: 'I can add archive links in Bulgarian if people want a follow-up version.',
    createdAt: '2025-04-17T13:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    moderationNote: null
  }
];

export const DEMO_ALBUMS: AlbumDto[] = [
  {
    id: 'album-1',
    ownerUsername: 'alex',
    title: 'Quiet History',
    description: 'Artifacts, archaeology, and visual storytelling.',
    coverItemId: 'item-sutton-hoo',
    itemIds: ['item-sutton-hoo', 'item-vermeer'],
    createdAt: '2025-04-11T08:00:00.000Z',
    updatedAt: '2025-04-16T08:00:00.000Z'
  },
  {
    id: 'album-2',
    ownerUsername: 'alex',
    title: 'Travel Through Reading',
    description: 'Country knowledge, maps, and place-based reading.',
    coverItemId: 'item-book-riot',
    itemIds: ['item-book-riot', 'item-bulgaria'],
    createdAt: '2025-04-13T08:00:00.000Z',
    updatedAt: '2025-04-16T08:00:00.000Z'
  }
];

export const DEMO_SUBMISSIONS: SubmissionDto[] = [
  {
    id: 'submission-1',
    type: 'link',
    title: 'A documentary archive on Black Sea port cities',
    sourceUrl: 'https://example.com/black-sea-ports',
    body: null,
    submittedBy: 'mila',
    status: 'pending',
    createdAt: '2025-04-18T08:00:00.000Z'
  },
  {
    id: 'submission-2',
    type: 'community_post',
    title: 'How to compare translated poetry editions',
    sourceUrl: null,
    body: 'A short guide to line breaks, notes, and what gets lost in bilingual publishing.',
    submittedBy: 'alex',
    status: 'approved',
    createdAt: '2025-04-17T09:00:00.000Z'
  }
];

export const DEMO_ERROR_LOGS: ErrorLogDto[] = [
  {
    id: 'log-1',
    scope: 'ingestion',
    message: 'Atlas Obscura feed timed out after 15 seconds.',
    level: 'warn',
    createdAt: '2025-04-18T09:15:00.000Z',
    resolvedAt: null
  },
  {
    id: 'log-2',
    scope: 'ai',
    message: 'Summary budget exceeded. Downgraded queued work to standard.',
    level: 'warn',
    createdAt: '2025-04-18T10:00:00.000Z',
    resolvedAt: '2025-04-18T10:20:00.000Z'
  }
];

export const DEMO_AI_CONFIG: AiModelConfig = {
  provider: 'openai',
  summaryModel: 'gpt-4.1-mini',
  translationModel: 'gpt-4.1-mini',
  askModel: 'gpt-4.1-mini',
  newsletterModel: 'gpt-4.1-mini',
  monthlyBudgetUsd: 250,
  perJobBudgetUsd: 2.5,
  autoDowngrade: true,
  pauseOnBudgetExceeded: false
};

export const DEMO_AI_USAGE: AiUsageSnapshot[] = [
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    purpose: 'summary',
    inputTokens: 1280,
    outputTokens: 195,
    totalCostUsd: 0.08,
    createdAt: '2025-04-18T11:00:00.000Z'
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    purpose: 'newsletter',
    inputTokens: 940,
    outputTokens: 212,
    totalCostUsd: 0.06,
    createdAt: '2025-04-18T11:10:00.000Z'
  }
];

export const DEMO_USERS: UserSettingsDto[] = [
  {
    username: 'alex',
    displayName: 'Alex Marin',
    role: 'user',
    language: 'en',
    contentLanguageMode: 'single',
    vibePreset: 'museum',
    fontFamily: PRESET_FONT_STACKS.museum,
    fontScale: 'md',
    imageMode: 'on',
    themeMode: 'light',
    contentMode: 'standard',
    newsletterEnabled: true,
    askAiEnabled: true,
    protectedModeEnabled: true
  },
  {
    username: 'admin',
    displayName: 'Admin Curator',
    role: 'admin',
    language: 'bg',
    contentLanguageMode: 'dual',
    vibePreset: 'archive',
    fontFamily: PRESET_FONT_STACKS.archive,
    fontScale: 'md',
    imageMode: 'on',
    themeMode: 'dark',
    contentMode: 'standard',
    newsletterEnabled: false,
    askAiEnabled: true,
    protectedModeEnabled: true
  }
];

export function resolveTranslation(item: ContentItem, language: InterfaceLanguage) {
  return item.translations.find((translation) => translation.language === language) || item.translations[0];
}

export function filterItemsForFeed(
  items: ContentItem[],
  feed: SubjectFeed,
  contentMode: ContentMode,
  hiddenIds: string[] = []
) {
  return items.filter((item) => {
    if (hiddenIds.includes(item.id)) return false;
    if (contentMode === 'kid') {
      if (item.audience === 'adult_only') return false;
      if (item.flags.includes('nsfw') || item.flags.includes('gore') || item.flags.includes('spoiler')) return false;
    }
    if (contentMode === 'standard' && item.audience === 'adult_only') return false;
    if (feed === 'saved') return true;
    if (feed === 'community') return item.subjects.includes('community');
    if (feed === 'videos') return item.subjects.includes('video');
    if (feed === 'country-knowledge') return item.subjects.includes('country_knowledge');
    return item.subjects.includes(feed.replace('-', '_') as SubjectTag);
  });
}
