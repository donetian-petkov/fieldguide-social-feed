'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ACTIVITY_URL = `${API_URL}/v1/runtime/activity`;
const ACTIVITY_THROTTLE_MS = 60_000;

function sendActivity(pathname: string) {
  const body = JSON.stringify({
    pathname,
    occurredAt: new Date().toISOString()
  });

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const payload = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(ACTIVITY_URL, payload);
    return;
  }

  void fetch(ACTIVITY_URL, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: {
      'content-type': 'application/json'
    },
    body
  }).catch(() => undefined);
}

export function RuntimeActivityBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    let lastSentAt = 0;

    const markActivity = () => {
      const now = Date.now();
      if (now - lastSentAt < ACTIVITY_THROTTLE_MS) {
        return;
      }
      lastSentAt = now;
      sendActivity(pathname);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markActivity();
      }
    };

    markActivity();
    window.addEventListener('pointerdown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('focus', markActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pathname]);

  return null;
}
