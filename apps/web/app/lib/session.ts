'use client';

import type { UserSettingsDto } from '@edu-feed/shared';

import { guestViewer } from './demo';
import { useMeQuery } from './api';

export function useSessionViewer(fallbackViewer: UserSettingsDto = guestViewer) {
  const meQuery = useMeQuery();
  const user = meQuery.data?.user || null;

  return {
    ...meQuery,
    viewer: user || fallbackViewer,
    apiViewer: user,
    isAuthenticated: !!user,
    albums: meQuery.data?.albums || []
  };
}
