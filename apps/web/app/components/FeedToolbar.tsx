'use client';

import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import KeyboardDoubleArrowUpRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowUpRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { Button, Chip, Stack } from '@mui/material';

import type { SubjectFeed } from '@edu-feed/shared';
import { SUBJECT_FEED_LABELS } from '@edu-feed/shared';

import { FEED_ORDER } from '../lib/demo';

export function FeedToolbar({ feed, language }: { feed: SubjectFeed; language: 'en' | 'bg' }) {
  const router = useRouter();
  const pathname = usePathname();
  const touchStartX = useRef<number | null>(null);
  const currentIndex = FEED_ORDER.indexOf(feed);

  const prevFeed = FEED_ORDER[(currentIndex - 1 + FEED_ORDER.length) % FEED_ORDER.length];
  const nextFeed = FEED_ORDER[(currentIndex + 1) % FEED_ORDER.length];

  const navigate = (target: SubjectFeed) => {
    if (target === 'saved') {
      router.push('/saved');
      return;
    }
    if (target === 'community') {
      router.push('/community');
      return;
    }
    router.push(`/feed/${target}`);
  };

  return (
    <Stack
      spacing={2}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX || null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const delta = event.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(delta) > 60) {
          navigate(delta > 0 ? prevFeed : nextFeed);
        }
        touchStartX.current = null;
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
        <Stack direction="row" spacing={1}>
          <Button startIcon={<ArrowBackRoundedIcon />} variant="outlined" onClick={() => navigate(prevFeed)}>
            {SUBJECT_FEED_LABELS[prevFeed][language]}
          </Button>
          <Button endIcon={<ArrowForwardRoundedIcon />} variant="outlined" onClick={() => navigate(nextFeed)}>
            {SUBJECT_FEED_LABELS[nextFeed][language]}
          </Button>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshRoundedIcon />} variant="contained" onClick={() => router.refresh()}>
            Refresh
          </Button>
          <Button
            startIcon={<KeyboardDoubleArrowUpRoundedIcon />}
            variant="outlined"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            To top
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {FEED_ORDER.map((entry) => (
          <Chip
            key={entry}
            label={SUBJECT_FEED_LABELS[entry][language]}
            color={entry === feed ? 'primary' : 'default'}
            variant={entry === feed ? 'filled' : 'outlined'}
            onClick={() => navigate(entry)}
            sx={{ fontWeight: 700 }}
          />
        ))}
        <Chip label={pathname} variant="outlined" />
      </Stack>
    </Stack>
  );
}
