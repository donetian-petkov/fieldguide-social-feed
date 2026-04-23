'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import KeyboardDoubleArrowUpRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowUpRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { Alert, Box, Button, Card, CardContent, Fab, Snackbar, Stack, Typography } from '@mui/material';

import type { ContentItem, SubjectFeed, UserSettingsDto } from '@edu-feed/shared';
import { resolveTranslation } from '@edu-feed/shared';

import { useFeedQuery } from '../lib/api';
import { getCommentsCountByItem } from '../lib/demo';
import { useSessionViewer } from '../lib/session';
import { AppShell } from './AppShell';
import { ArticleCard } from './ArticleCard';
import { ContentImage } from './ContentImage';
import { FeedToolbar } from './FeedToolbar';

export function FeedScreen({
  feed,
  title,
  subtitle,
  viewer,
  items,
  pinnedItems
}: {
  feed: SubjectFeed;
  title: string;
  subtitle: string;
  viewer: UserSettingsDto;
  items: ContentItem[];
  pinnedItems: ContentItem[];
}) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const session = useSessionViewer(viewer);
  const isSavedGuestView = feed === 'saved' && !session.isAuthenticated;
  const feedQuery = useFeedQuery({ feed }, { skip: isSavedGuestView });
  const resolvedViewer = session.viewer;
  const resolvedLanguage = resolvedViewer.language as 'en' | 'bg';
  const resolvedLanguageMode = resolvedViewer.contentLanguageMode;
  const resolvedImageMode = resolvedViewer.imageMode;
  const fallbackItems = isSavedGuestView ? [] : items;
  const fallbackPinnedItems = isSavedGuestView ? [] : pinnedItems;
  const effectiveItems = feedQuery.data?.items || fallbackItems;
  const effectivePinnedItems = feedQuery.data?.pinnedItems || fallbackPinnedItems;
  const visibleItems = effectiveItems.filter((item) => !hiddenIds.includes(item.id));

  return (
    <AppShell title={title} subtitle={subtitle} viewer={resolvedViewer}>
      <Stack spacing={3}>
        <FeedToolbar feed={feed} language={resolvedLanguage} />

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            alignItems: 'start',
            gridTemplateColumns: effectivePinnedItems.length
              ? {
                  xs: '1fr',
                  lg: 'minmax(250px, 300px) minmax(0, 1fr)'
                }
              : '1fr'
          }}
        >
          {effectivePinnedItems.length ? (
            <Card
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                order: {
                  xs: 0,
                  lg: 0
                },
                position: {
                  lg: 'sticky'
                },
                top: {
                  lg: 96
                }
              }}
            >
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PushPinRoundedIcon fontSize="small" />
                    <Typography variant="h6">Pinned stories</Typography>
                  </Stack>
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 1.5,
                      maxHeight: {
                        lg: 'calc(100vh - 10rem)'
                      },
                      overflowY: {
                        lg: 'auto'
                      },
                      pr: {
                        lg: 0.5
                      }
                    }}
                  >
                    {effectivePinnedItems.map((item) => {
                      const translation = resolveTranslation(item, resolvedLanguage) || item.translations[0];
                      return (
                        <Card
                          key={item.id}
                          variant="outlined"
                          sx={{
                            overflow: 'hidden',
                            borderRadius: 3
                          }}
                        >
                          {resolvedImageMode === 'on' ? (
                            <ContentImage
                              src={item.coverImageUrl}
                              alt={translation?.title || item.originalTitle}
                              sourceIconUrl={item.sourceIconUrl}
                              sourceName={item.sourceName}
                              height={120}
                              compact
                            />
                          ) : null}
                          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                            <Stack spacing={1}>
                              <Typography variant="caption" color="text.secondary">
                                {item.sourceName} • {new Date(item.publishedAt).toLocaleDateString()}
                              </Typography>
                              <Typography
                                component={Link}
                                href={`/item/${item.slug}`}
                                variant="subtitle1"
                                sx={{
                                  color: 'inherit',
                                  textDecoration: 'none'
                                }}
                              >
                                {translation?.title || item.originalTitle}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  display: '-webkit-box',
                                  overflow: 'hidden',
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: 'vertical'
                                }}
                              >
                                {translation?.summary || item.originalSummary}
                              </Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          <Stack spacing={2}>
            {visibleItems.map((item) => (
              <ArticleCard
                key={item.id}
                item={item}
                language={resolvedLanguage}
                languageMode={resolvedLanguageMode}
                commentCount={getCommentsCountByItem(item.id)}
                showImage={resolvedImageMode === 'on'}
                onHide={(itemId) => {
                  setHiddenIds((current) => [...current, itemId]);
                  setToast('Item hidden from the current view.');
                }}
              />
            ))}

            {isSavedGuestView ? (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Alert severity="info">Sign in to save stories and view your saved library.</Alert>
                    <Typography variant="h6">Saved stories are account-only</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Guests can browse and share stories, but saving requires an account so the library can persist across devices.
                    </Typography>
                    <Button component={Link} href="/auth" variant="contained" sx={{ alignSelf: 'flex-start' }}>
                      Login / Register
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ) : !visibleItems.length ? (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6">No items remain in this view</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Change the content mode, clear hidden items, or switch subjects.
                  </Typography>
                </CardContent>
              </Card>
            ) : null}

            {feedQuery.isError ? (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Feed data could not be loaded from the API. Check the API connection or refresh again.
                  </Typography>
                </CardContent>
              </Card>
            ) : null}
          </Stack>
        </Box>
      </Stack>

      <Box
        sx={{
          display: {
            xs: 'flex',
            md: 'none'
          },
          position: 'fixed',
          right: 16,
          bottom: 20,
          zIndex: (theme) => theme.zIndex.tooltip,
          flexDirection: 'column',
          gap: 1.25
        }}
      >
        <Fab
          size="small"
          color="primary"
          aria-label="Refresh feed"
          onClick={() => router.refresh()}
        >
          <RefreshRoundedIcon />
        </Fab>
        <Fab
          size="small"
          color="secondary"
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <KeyboardDoubleArrowUpRoundedIcon />
        </Fab>
      </Box>

      <Snackbar open={!!toast} autoHideDuration={2200} message={toast || ''} onClose={() => setToast(null)} />
    </AppShell>
  );
}
