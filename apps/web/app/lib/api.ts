'use client';

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const fieldguideApi = createApi({
  reducerPath: 'fieldguideApi',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  }),
  endpoints: (builder) => ({
    health: builder.query<{ ok: boolean; mode: string }, void>({
      query: () => '/health'
    }),
    feed: builder.query({
      query: (feed: string) => `/v1/feed?feed=${feed}`
    }),
    item: builder.query({
      query: (itemId: string) => `/v1/items/${itemId}`
    })
  })
});

export const { useFeedQuery, useHealthQuery, useItemQuery } = fieldguideApi;
