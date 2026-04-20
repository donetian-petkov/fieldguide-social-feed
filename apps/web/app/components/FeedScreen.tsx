'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Box, Card, CardContent, Divider, Snackbar, Stack, Typography } from '@mui/material';

import type { ContentItem, SubjectFeed, UserSettingsDto } from '@edu-feed/shared';
import { resolveTranslation } from '@edu-feed/shared';

import { getCommentsCountByItem } from '../lib/demo';
import { AppShell } from './AppShell';
import { ArticleCard } from './ArticleCard';
import { FeedToolbar } from './FeedToolbar';

export function FeedScreen({
  feed,
  title,
  subtitle,
  viewer,
  language,
  languageMode,
  imageMode,
  items,
  pinnedItems
}: {
  feed: SubjectFeed;
  title: string;
  subtitle: string;
  viewer: UserSettingsDto;
  language: 'en' | 'bg';
  languageMode: 'single' | 'dual';
  imageMode: 'on' | 'off';
  items: ContentItem[];
  pinnedItems: ContentItem[];
}) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const visibleItems = items.filter((item) => !hiddenIds.includes(item.id));

  return (
    <AppShell title={title} subtitle={subtitle} viewer={viewer}>
      <Stack spacing={3}>
        <FeedToolbar feed={feed} language={language} />

        {pinnedItems.length ? (
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h5">Pinned carousel</Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: 'repeat(3, minmax(0, 1fr))'
                    }
                  }}
                >
                  {pinnedItems.map((item) => {
                    const translation = resolveTranslation(item, language);
                    return (
                      <Box key={item.id}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                          <Box
                            component="img"
                            src={item.coverImageUrl}
                            alt={translation?.title || item.originalTitle}
                            sx={{ height: 160, width: '100%', objectFit: 'cover' }}
                          />
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography component={Link} href={`/item/${item.slug}`} variant="subtitle1">
                                {translation?.title || item.originalTitle}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {translation?.summary}
                              </Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Box>
                    );
                  })}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Divider />

        <Stack spacing={2}>
          {visibleItems.map((item) => (
            <ArticleCard
              key={item.id}
              item={item}
              language={language}
              languageMode={languageMode}
              commentCount={getCommentsCountByItem(item.id)}
              showImage={imageMode === 'on'}
              onHide={(itemId) => {
                setHiddenIds((current) => [...current, itemId]);
                setToast('Item hidden from the current view.');
              }}
            />
          ))}
        </Stack>

        {!visibleItems.length ? (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6">No items remain in this view</Typography>
              <Typography variant="body2" color="text.secondary">
                Change the content mode, clear hidden items, or switch subjects.
              </Typography>
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <Snackbar open={!!toast} autoHideDuration={2200} message={toast || ''} onClose={() => setToast(null)} />
    </AppShell>
  );
}
