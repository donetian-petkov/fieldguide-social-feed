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
  SourceDefinition,
  SubmissionDto,
  SubjectFeed,
  UserSettingsDto
} from '@edu-feed/shared';

type MeResponse = {
  user: UserSettingsDto | null;
  albums?: AlbumDto[];
};

type FeedResponse = {
  items: ContentItem[];
  pinnedItems: ContentItem[];
  savedIds: string[];
  hiddenIds: string[];
  mode: ContentMode;
  feed: SubjectFeed;
};

type ItemResponse = {
  item: ContentItem;
  comments: CommentDto[];
};

type ProfileResponse = {
  username: string;
  items: ContentItem[];
};

type AdminDashboardResponse = {
  sources: SourceDefinition[];
  submissions: SubmissionDto[];
  users: UserSettingsDto[];
  errorLogs: ErrorLogDto[];
  aiConfig: AiModelConfig;
  aiUsage: AiUsageSnapshot[];
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

export const fieldguideApi = createApi({
  reducerPath: 'fieldguideApi',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    credentials: 'include'
  }),
  tagTypes: ['Me', 'Feed', 'Item', 'Albums', 'Admin', 'Profile'],
  endpoints: (builder) => ({
    health: builder.query<{ ok: boolean; mode: string }, void>({
      query: () => '/health'
    }),
    me: builder.query<MeResponse, void>({
      query: () => '/v1/me',
      providesTags: ['Me', 'Albums']
    }),
    feed: builder.query<FeedResponse, { feed: SubjectFeed }>({
      query: ({ feed }) => `/v1/feed?feed=${feed}`,
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
    resyncSource: builder.mutation<{ ok: boolean }, string>({
      query: (sourceId) => ({
        url: `/v1/admin/sources/${sourceId}/resync`,
        method: 'POST'
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
      invalidatesTags: ['Feed', 'Albums']
    }),
    unsaveItem: builder.mutation<{ ok: boolean; savedIds: string[] }, string>({
      query: (itemId) => ({
        url: `/v1/items/${itemId}/save`,
        method: 'DELETE'
      }),
      invalidatesTags: ['Feed', 'Albums']
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
    createComment: builder.mutation<{ comment: CommentDto }, { itemId: string; body: string }>({
      query: ({ itemId, body }) => ({
        url: `/v1/items/${itemId}/comments`,
        method: 'POST',
        body: { body }
      }),
      invalidatesTags: ['Item']
    })
  })
});

export const {
  useAdminDashboardQuery,
  useAlbumsQuery,
  useAskAiMutation,
  useAddSourceMutation,
  useCreateCommentMutation,
  useFeedQuery,
  useHealthQuery,
  useHideItemMutation,
  useItemQuery,
  useLoginMutation,
  useLogoutMutation,
  useMeQuery,
  useProfileQuery,
  useRegisterMutation,
  useResyncSourceMutation,
  useSaveItemMutation,
  useShareItemMutation,
  useSwitchContentModeMutation,
  useUpdateSettingsMutation,
  useUnsaveItemMutation
} = fieldguideApi;
