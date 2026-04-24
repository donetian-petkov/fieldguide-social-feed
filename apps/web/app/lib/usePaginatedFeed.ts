'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ContentItem, FeedPageInfo, SubjectFeed } from '@edu-feed/shared';
import { DEFAULT_FEED_PAGE_SIZE } from '@edu-feed/shared';

import { useFeedQuery } from './api';

function mergeItems(current: ContentItem[], next: ContentItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}

type UsePaginatedFeedOptions = {
  feed: SubjectFeed;
  fallbackItems: ContentItem[];
  fallbackPinnedItems: ContentItem[];
  skip?: boolean;
};

export function usePaginatedFeed({ feed, fallbackItems, fallbackPinnedItems, skip = false }: UsePaginatedFeedOptions) {
  const [page, setPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [apiItems, setApiItems] = useState<ContentItem[]>([]);
  const [apiPinnedItems, setApiPinnedItems] = useState<ContentItem[]>([]);
  const [apiPagination, setApiPagination] = useState<FeedPageInfo | null>(null);
  const feedQuery = useFeedQuery(
    {
      feed,
      page,
      pageSize: DEFAULT_FEED_PAGE_SIZE,
      refreshToken
    },
    { skip }
  );

  useEffect(() => {
    setPage(1);
    setRefreshToken(0);
    setApiItems([]);
    setApiPinnedItems([]);
    setApiPagination(null);
  }, [feed, skip]);

  useEffect(() => {
    const nextData = feedQuery.data;
    if (!nextData) {
      return;
    }

    setApiItems((current) => (page === 1 ? nextData.items : mergeItems(current, nextData.items)));
    setApiPinnedItems(nextData.pinnedItems);
    setApiPagination(nextData.pagination);
  }, [feedQuery.data, page]);

  const fallbackVisibleItems = useMemo(
    () => fallbackItems.slice(0, page * DEFAULT_FEED_PAGE_SIZE),
    [fallbackItems, page]
  );

  const fallbackPagination = useMemo<FeedPageInfo>(
    () => ({
      page,
      pageSize: DEFAULT_FEED_PAGE_SIZE,
      totalItems: fallbackItems.length,
      hasMore: page * DEFAULT_FEED_PAGE_SIZE < fallbackItems.length
    }),
    [fallbackItems.length, page]
  );

  const hasApiSnapshot = apiPagination !== null;

  return {
    items: hasApiSnapshot ? apiItems : fallbackVisibleItems,
    pinnedItems: hasApiSnapshot ? apiPinnedItems : fallbackPinnedItems,
    pagination: hasApiSnapshot ? apiPagination : fallbackPagination,
    isError: feedQuery.isError,
    isFetching: feedQuery.isFetching,
    isLoading: feedQuery.isLoading,
    refresh: () => {
      setPage(1);
      setApiItems([]);
      setApiPinnedItems([]);
      setApiPagination(null);
      setRefreshToken((current) => current + 1);
    },
    loadMore: () => {
      const activePagination = hasApiSnapshot ? apiPagination : fallbackPagination;
      if (!activePagination?.hasMore || feedQuery.isFetching) {
        return;
      }
      setPage((current) => current + 1);
    }
  };
}
