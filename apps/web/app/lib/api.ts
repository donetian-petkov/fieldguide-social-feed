'use client';

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import type {
  AiModelConfig,
  AiUsageSnapshot,
  AlbumDto,
  CommentDto,
  ContentItem,
  ContentMode,
  ErrorLogDto,
  FeedPageInfo,
  SourceDefinition,
  GeneratedStoryDraftDto,
  SubmissionDto,
  SubjectFeed,
  UserSettingsDto
} from '@edu-feed/shared';

type MeResponse = {
  user: UserSettingsDto | null;
  albums?: AlbumDto[];
  savedIds?: string[];
};

type FeedResponse = {
  items: ContentItem[];
  pinnedItems: ContentItem[];
  savedIds: string[];
  hiddenIds: string[];
  mode: ContentMode;
  feed: SubjectFeed;
  pagination: FeedPageInfo;
};

type ItemResponse = {
  item: ContentItem;
  comments: CommentDto[];
};

type AlbumDetailResponse = {
  album: AlbumDto;
  items: ContentItem[];
};

type ProfileResponse = {
  username: string;
  items: ContentItem[];
};

type AdminDashboardResponse = {
  sources: SourceDefinition[];
  submissions: SubmissionDto[];
  users: UserSettingsDto[];
  items: ContentItem[];
  comments: CommentDto[];
  errorLogs: ErrorLogDto[];
  aiConfig: AiModelConfig;
  aiUsage: AiUsageSnapshot[];
  generatedStories: GeneratedStoryDraftDto[];
};

type AuthBody = {
  username: string;
  password: string;
  displayName?: string;
};

type AskAiResponse = {
  answer: string;
  citations: string[];
};

type HealthResponse = {
  ok: boolean;
  mode: string;
  uptime?: number;
  aiAvailable: boolean;
  aiProvider: AiModelConfig['provider'];
};

export const fieldguideApi = createApi({
  reducerPath: 'fieldguideApi',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    credentials: 'include'
  }),
  tagTypes: ['Health', 'Me', 'Feed', 'Item', 'Albums', 'Admin', 'Profile'],
  endpoints: (builder) => ({
    health: builder.query<HealthResponse, void>({
      query: () => '/health',
      providesTags: ['Health'],
      keepUnusedDataFor: 0
    }),
    me: builder.query<MeResponse, void>({
      query: () => '/v1/me',
      providesTags: ['Me', 'Albums']
    }),
    feed: builder.query<FeedResponse, { feed: SubjectFeed; page?: number; pageSize?: number; refreshToken?: number }>({
      query: ({ feed, page = 1, pageSize = 20 }) => `/v1/feed?feed=${feed}&page=${page}&pageSize=${pageSize}`,
      providesTags: (_result, _error, args) => ['Feed', { type: 'Feed', id: args.feed }]
    }),
    item: builder.query<ItemResponse, string>({
      query: (itemId: string) => `/v1/items/${itemId}`,
      providesTags: (_result, _error, itemId) => ['Item', { type: 'Item', id: itemId }]
    }),
    profile: builder.query<ProfileResponse, string>({
      query: (username: string) => `/v1/profile/${username}`,
      providesTags: (_result, _error, username) => [{ type: 'Profile', id: username }]
    }),
    albums: builder.query<{ albums: AlbumDto[] }, void>({
      query: () => '/v1/albums',
      providesTags: ['Albums']
    }),
    album: builder.query<AlbumDetailResponse, string>({
      query: (albumId) => `/v1/albums/${albumId}`,
      providesTags: (_result, _error, albumId) => [{ type: 'Albums', id: albumId }]
    }),
    createAlbum: builder.mutation<{ album: AlbumDto }, { title: string; description: string }>({
      query: (body) => ({
        url: '/v1/albums',
        method: 'POST',
        body
      }),
      invalidatesTags: ['Albums']
    }),
    updateAlbum: builder.mutation<
      { album: AlbumDto },
      { albumId: string; patch: Partial<Pick<AlbumDto, 'title' | 'description' | 'coverItemId' | 'itemIds'>> }
    >({
      query: ({ albumId, patch }) => ({
        url: `/v1/albums/${albumId}`,
        method: 'PATCH',
        body: patch
      }),
      invalidatesTags: (_result, _error, { albumId }) => ['Albums', { type: 'Albums', id: albumId }]
    }),
    deleteAlbum: builder.mutation<{ ok: boolean }, string>({
      query: (albumId) => ({
        url: `/v1/albums/${albumId}`,
        method: 'DELETE'
      }),
      invalidatesTags: ['Albums']
    }),
    addAlbumItem: builder.mutation<{ album: AlbumDto }, { albumId: string; itemId: string }>({
      query: ({ albumId, itemId }) => ({
        url: `/v1/albums/${albumId}/items`,
        method: 'POST',
        body: { itemId }
      }),
      invalidatesTags: (_result, _error, { albumId }) => ['Albums', { type: 'Albums', id: albumId }]
    }),
    adminDashboard: builder.query<AdminDashboardResponse, void>({
      query: () => '/v1/admin/dashboard',
      providesTags: ['Admin']
    }),
    addSource: builder.mutation<{ source: SourceDefinition }, Omit<SourceDefinition, 'id'>>({
      query: (body) => ({
        url: '/v1/admin/sources',
        method: 'POST',
        body
      }),
      invalidatesTags: ['Admin']
    }),
    updateSource: builder.mutation<{ source: SourceDefinition }, { sourceId: string; patch: Partial<Omit<SourceDefinition, 'id'>> }>({
      query: ({ sourceId, patch }) => ({
        url: `/v1/admin/sources/${sourceId}`,
        method: 'PATCH',
        body: patch
      }),
      invalidatesTags: ['Admin']
    }),
    deleteSource: builder.mutation<{ ok: boolean }, string>({
      query: (sourceId) => ({
        url: `/v1/admin/sources/${sourceId}`,
        method: 'DELETE'
      }),
      invalidatesTags: ['Admin', 'Feed', 'Item', 'Profile']
    }),
    resyncSource: builder.mutation<{ ok: boolean }, string>({
      query: (sourceId) => ({
        url: `/v1/admin/sources/${sourceId}/resync`,
        method: 'POST'
      }),
      invalidatesTags: ['Admin']
    }),
    updateAiConfig: builder.mutation<{ config: AiModelConfig }, Partial<AiModelConfig>>({
      query: (body) => ({
        url: '/v1/admin/ai/config',
        method: 'PUT',
        body
      }),
      invalidatesTags: ['Admin', 'Health']
    }),
    generatedStories: builder.query<{ drafts: GeneratedStoryDraftDto[] }, void>({
      query: () => '/v1/admin/generated-stories',
      providesTags: ['Admin']
    }),
    requestGeneratedStory: builder.mutation<{ draft: GeneratedStoryDraftDto }, { subject: GeneratedStoryDraftDto['subject']; prompt: string }>({
      query: (body) => ({
        url: '/v1/admin/generated-stories',
        method: 'POST',
        body
      }),
      invalidatesTags: ['Admin']
    }),
    reviewGeneratedStory: builder.mutation<
      { draft: GeneratedStoryDraftDto; item: ContentItem | null },
      { draftId: string; decision: 'approved' | 'rejected' }
    >({
      query: ({ draftId, decision }) => ({
        url: `/v1/admin/generated-stories/${draftId}/review`,
        method: 'POST',
        body: { decision }
      }),
      invalidatesTags: ['Admin', 'Feed', 'Item', 'Profile']
    }),
    reviewSubmission: builder.mutation<{ submission: SubmissionDto; item: ContentItem | null }, { submissionId: string; decision: 'approved' | 'rejected' }>({
      query: ({ submissionId, decision }) => ({
        url: `/v1/admin/submissions/${submissionId}/review`,
        method: 'POST',
        body: { decision }
      }),
      invalidatesTags: ['Admin', 'Feed', 'Profile']
    }),
    deleteAdminComment: builder.mutation<{ comment: CommentDto }, { commentId: string; moderationNote?: string }>({
      query: ({ commentId, ...body }) => ({
        url: `/v1/admin/comments/${commentId}/delete`,
        method: 'POST',
        body
      }),
      invalidatesTags: ['Admin', 'Item']
    }),
    patchAdminItem: builder.mutation<
      { item: ContentItem },
      { itemId: string; patch: Partial<Pick<ContentItem, 'audience' | 'commentsLocked' | 'flags' | 'hiddenByDefault' | 'pinned'>> }
    >({
      query: ({ itemId, patch }) => ({
        url: `/v1/admin/items/${itemId}`,
        method: 'PATCH',
        body: patch
      }),
      invalidatesTags: ['Admin', 'Feed', 'Item']
    }),
    removeAdminItem: builder.mutation<{ item: ContentItem }, { itemId: string; removed: boolean }>({
      query: ({ itemId, removed }) => ({
        url: `/v1/admin/items/${itemId}/remove`,
        method: 'POST',
        body: { removed }
      }),
      invalidatesTags: ['Admin', 'Feed', 'Item', 'Profile']
    }),
    pinAdminItem: builder.mutation<{ item: ContentItem }, { itemId: string; slot: number }>({
      query: ({ itemId, slot }) => ({
        url: `/v1/admin/items/${itemId}/pin`,
        method: 'POST',
        body: { slot }
      }),
      invalidatesTags: ['Admin', 'Feed', 'Item']
    }),
    lockAdminItemComments: builder.mutation<{ item: ContentItem }, { itemId: string; locked: boolean }>({
      query: ({ itemId, locked }) => ({
        url: `/v1/admin/items/${itemId}/lock-comments`,
        method: 'POST',
        body: { locked }
      }),
      invalidatesTags: ['Admin', 'Item']
    }),
    suspendAdminUser: builder.mutation<{ user: UserSettingsDto }, { username: string; suspended: boolean }>({
      query: ({ username, suspended }) => ({
        url: `/v1/admin/users/${username}/suspend`,
        method: 'POST',
        body: { suspended }
      }),
      invalidatesTags: ['Admin']
    }),
    setAdminUserRole: builder.mutation<{ user: UserSettingsDto }, { username: string; role: UserSettingsDto['role'] }>({
      query: ({ username, role }) => ({
        url: `/v1/admin/users/${username}/role`,
        method: 'POST',
        body: { role }
      }),
      invalidatesTags: ['Admin']
    }),
    login: builder.mutation<{ user: UserSettingsDto }, AuthBody>({
      query: (body) => ({
        url: '/v1/auth/login',
        method: 'POST',
        body
      }),
      invalidatesTags: ['Me', 'Albums', 'Admin']
    }),
    register: builder.mutation<{ user: UserSettingsDto }, Required<AuthBody>>({
      query: (body) => ({
        url: '/v1/auth/register',
        method: 'POST',
        body
      }),
      invalidatesTags: ['Me', 'Albums']
    }),
    forgotPassword: builder.mutation<{ ok: boolean; previewToken: string | null }, { identifier: string }>({
      query: (body) => ({
        url: '/v1/auth/forgot-password',
        method: 'POST',
        body
      })
    }),
    resetPassword: builder.mutation<{ ok: boolean }, { token: string; password: string }>({
      query: (body) => ({
        url: '/v1/auth/reset-password',
        method: 'POST',
        body
      })
    }),
    logout: builder.mutation<{ ok: boolean }, void>({
      query: () => ({
        url: '/v1/auth/logout',
        method: 'POST'
      }),
      invalidatesTags: ['Me', 'Albums', 'Admin']
    }),
    switchContentMode: builder.mutation<{ ok: boolean; nextMode: ContentMode; verifiedUntil: string | null }, { nextMode: ContentMode; password?: string }>({
      query: (body) => ({
        url: '/v1/account/content-mode/switch',
        method: 'POST',
        body
      }),
      invalidatesTags: ['Me', 'Feed']
    }),
    updateSettings: builder.mutation<{ user: UserSettingsDto }, Partial<UserSettingsDto>>({
      query: (body) => ({
        url: '/v1/me/settings',
        method: 'PATCH',
        body
      }),
      invalidatesTags: ['Me']
    }),
    saveItem: builder.mutation<{ ok: boolean; savedIds: string[] }, string>({
      query: (itemId) => ({
        url: `/v1/items/${itemId}/save`,
        method: 'POST'
      }),
      invalidatesTags: ['Feed', 'Albums', 'Me']
    }),
    unsaveItem: builder.mutation<{ ok: boolean; savedIds: string[] }, string>({
      query: (itemId) => ({
        url: `/v1/items/${itemId}/save`,
        method: 'DELETE'
      }),
      invalidatesTags: ['Feed', 'Albums', 'Me']
    }),
    hideItem: builder.mutation<{ ok: boolean; hiddenIds: string[] }, string>({
      query: (itemId) => ({
        url: `/v1/items/${itemId}/hide`,
        method: 'POST'
      }),
      invalidatesTags: ['Feed']
    }),
    shareItem: builder.mutation<{ ok: boolean; shareUrl: string }, string>({
      query: (itemId) => ({
        url: `/v1/items/${itemId}/share`,
        method: 'POST'
      })
    }),
    askAi: builder.mutation<AskAiResponse, { itemId: string; question: string; language: 'en' | 'bg' }>({
      query: ({ itemId, ...body }) => ({
        url: `/v1/items/${itemId}/ask-ai`,
        method: 'POST',
        body
      })
    }),
    createSubmission: builder.mutation<
      { submission: SubmissionDto },
      { type: 'link' | 'community_post'; title: string; sourceUrl?: string | null; body?: string | null }
    >({
      query: (body) => ({
        url: '/v1/submissions',
        method: 'POST',
        body
      }),
      invalidatesTags: ['Admin', 'Feed', 'Profile']
    }),
    createComment: builder.mutation<{ comment: CommentDto }, { itemId: string; body: string }>({
      query: ({ itemId, body }) => ({
        url: `/v1/items/${itemId}/comments`,
        method: 'POST',
        body: { body }
      }),
      invalidatesTags: ['Item']
    }),
    updateComment: builder.mutation<{ comment: CommentDto }, { commentId: string; body: string }>({
      query: ({ commentId, body }) => ({
        url: `/v1/comments/${commentId}`,
        method: 'PATCH',
        body: { body }
      }),
      invalidatesTags: ['Item']
    })
  })
});

export const {
  useAdminDashboardQuery,
  useAddAlbumItemMutation,
  useAlbumQuery,
  useAlbumsQuery,
  useAskAiMutation,
  useAddSourceMutation,
  useCreateAlbumMutation,
  useCreateCommentMutation,
  useCreateSubmissionMutation,
  useDeleteAlbumMutation,
  useDeleteSourceMutation,
  useDeleteAdminCommentMutation,
  useFeedQuery,
  useForgotPasswordMutation,
  useGeneratedStoriesQuery,
  useHealthQuery,
  useHideItemMutation,
  useItemQuery,
  useLockAdminItemCommentsMutation,
  useLoginMutation,
  useLogoutMutation,
  useMeQuery,
  usePatchAdminItemMutation,
  usePinAdminItemMutation,
  useProfileQuery,
  useRegisterMutation,
  useRemoveAdminItemMutation,
  useReviewSubmissionMutation,
  useRequestGeneratedStoryMutation,
  useReviewGeneratedStoryMutation,
  useResetPasswordMutation,
  useResyncSourceMutation,
  useSaveItemMutation,
  useShareItemMutation,
  useSetAdminUserRoleMutation,
  useSuspendAdminUserMutation,
  useSwitchContentModeMutation,
  useUpdateAlbumMutation,
  useUpdateAiConfigMutation,
  useUpdateCommentMutation,
  useUpdateSourceMutation,
  useUpdateSettingsMutation,
  useUnsaveItemMutation
} = fieldguideApi;

export function useRuntimeHealthQuery() {
  return useHealthQuery(undefined, {
    pollingInterval: 5000,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true
  });
}
