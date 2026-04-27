'use client';

import Link from 'next/link';
import { Box, Button, Stack, Typography } from '@mui/material';

import { FeedScreen } from '../components/FeedScreen';
import { SectionCard } from '../components/SectionCard';
import { getFeedModel } from '../lib/demo';
import { useSessionViewer } from '../lib/session';

export default function SavedPage() {
  const model = getFeedModel('saved');
  const session = useSessionViewer(model.viewer);
  const albums = session.albums;

  return (
    <FeedScreen
      feed={model.feed}
      title={model.title}
      subtitle="Everything you bookmarked plus anything tucked into your custom albums."
      viewer={model.viewer}
      savedIds={model.savedIds}
      items={model.items}
      pinnedItems={[]}
      topContent={
        <SectionCard title="Albums" eyebrow="Saved library">
          {!session.isAuthenticated ? (
            <Typography variant="body2" color="text.secondary">
              Sign in to view albums and organize saved stories into custom reading shelves.
            </Typography>
          ) : albums.length ? (
            <Stack spacing={1.25}>
              {albums.map((album) => (
                <Stack
                  key={album.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle2">{album.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {album.itemIds.length} {album.itemIds.length === 1 ? 'item' : 'items'}
                    </Typography>
                  </Box>
                  <Button component={Link} href={`/albums/${album.id}`} size="small" variant="outlined">
                    Open album
                  </Button>
                </Stack>
              ))}
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                No albums yet. Create one in Settings, then save stories directly into it from any item card or detail page.
              </Typography>
              <Button component={Link} href="/settings" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
                Create album
              </Button>
            </Stack>
          )}
        </SectionCard>
      }
    />
  );
}
