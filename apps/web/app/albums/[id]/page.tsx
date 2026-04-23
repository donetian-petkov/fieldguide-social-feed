'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { ArticleCard } from '../../components/ArticleCard';
import { SectionCard } from '../../components/SectionCard';
import { demoViewer, getAlbumModel, getAlbumCover, getCommentsCountByItem } from '../../lib/demo';
import { useAlbumQuery, useDeleteAlbumMutation, useUpdateAlbumMutation } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AlbumPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const fallback = getAlbumModel(params.id);
  const { viewer, isAuthenticated } = useSessionViewer(demoViewer);
  const albumQuery = useAlbumQuery(params.id, {
    skip: !isAuthenticated
  });
  const [updateAlbum, updateAlbumState] = useUpdateAlbumMutation();
  const [deleteAlbum, deleteAlbumState] = useDeleteAlbumMutation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const album = albumQuery.data?.album || fallback?.album || null;
  const items = albumQuery.data?.items || fallback?.items || [];
  const cover = items.find((item) => item.id === album?.coverItemId) || (album ? getAlbumCover(album) : null);

  useEffect(() => {
    if (album) {
      setTitle(album.title);
      setDescription(album.description);
    }
  }, [album?.description, album?.id, album?.title]);

  if (!album) {
    return (
      <AppShell title="Album not found" subtitle="This album does not exist in the current library." viewer={viewer}>
        <Typography variant="body1">Open a saved album from the settings page or saved feed.</Typography>
      </AppShell>
    );
  }

  return (
    <AppShell title={album.title} subtitle={album.description} viewer={viewer}>
      <Stack spacing={3}>
        <SectionCard title="Album settings" eyebrow="Library management">
          <Stack spacing={1.5}>
            <TextField
              label="Album title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!isAuthenticated || updateAlbumState.isLoading}
            />
            <TextField
              label="Album description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!isAuthenticated || updateAlbumState.isLoading}
              multiline
              minRows={2}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                disabled={!isAuthenticated || !title.trim() || updateAlbumState.isLoading}
                onClick={async () => {
                  try {
                    await updateAlbum({
                      albumId: album.id,
                      patch: {
                        title: title.trim(),
                        description: description.trim()
                      }
                    }).unwrap();
                    setMessage('Album details saved.');
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Could not save album details.');
                  }
                }}
              >
                {updateAlbumState.isLoading ? 'Saving...' : 'Save details'}
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={!isAuthenticated || deleteAlbumState.isLoading}
                onClick={async () => {
                  try {
                    await deleteAlbum(album.id).unwrap();
                    router.push('/settings');
                    router.refresh();
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Could not delete the album.');
                  }
                }}
              >
                {deleteAlbumState.isLoading ? 'Deleting...' : 'Delete album'}
              </Button>
            </Stack>
          </Stack>
        </SectionCard>

        {cover ? (
          <SectionCard title="Album cover" eyebrow="Curated collection">
            <img src={cover.coverImageUrl} alt={cover.originalTitle} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 16 }} />
          </SectionCard>
        ) : null}

        <Box sx={{ display: 'grid', gap: 2 }}>
          {items.map((item, index) => (
            <Box key={item.id}>
              <Stack spacing={1.25} sx={{ mb: 1.25 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant={album.coverItemId === item.id ? 'contained' : 'outlined'}
                    size="small"
                    disabled={!isAuthenticated || updateAlbumState.isLoading}
                    onClick={async () => {
                      try {
                        await updateAlbum({
                          albumId: album.id,
                          patch: {
                            coverItemId: item.id
                          }
                        }).unwrap();
                        setMessage('Album cover updated.');
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : 'Could not set the album cover.');
                      }
                    }}
                  >
                    {album.coverItemId === item.id ? 'Current cover' : 'Set as cover'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!isAuthenticated || index === 0 || updateAlbumState.isLoading}
                    onClick={async () => {
                      const nextItemIds = [...items.map((entry) => entry.id)];
                      const currentId = nextItemIds[index];
                      const previousId = nextItemIds[index - 1];
                      if (!currentId || !previousId) {
                        return;
                      }
                      nextItemIds[index - 1] = currentId;
                      nextItemIds[index] = previousId;
                      try {
                        await updateAlbum({
                          albumId: album.id,
                          patch: {
                            itemIds: nextItemIds,
                            coverItemId: album.coverItemId
                          }
                        }).unwrap();
                        setMessage('Album order updated.');
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : 'Could not update the album order.');
                      }
                    }}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!isAuthenticated || index === items.length - 1 || updateAlbumState.isLoading}
                    onClick={async () => {
                      const nextItemIds = [...items.map((entry) => entry.id)];
                      const currentId = nextItemIds[index];
                      const nextId = nextItemIds[index + 1];
                      if (!currentId || !nextId) {
                        return;
                      }
                      nextItemIds[index] = nextId;
                      nextItemIds[index + 1] = currentId;
                      try {
                        await updateAlbum({
                          albumId: album.id,
                          patch: {
                            itemIds: nextItemIds,
                            coverItemId: album.coverItemId
                          }
                        }).unwrap();
                        setMessage('Album order updated.');
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : 'Could not update the album order.');
                      }
                    }}
                  >
                    Move down
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    disabled={!isAuthenticated || updateAlbumState.isLoading}
                    onClick={async () => {
                      const nextItemIds = items.map((entry) => entry.id).filter((itemId) => itemId !== item.id);
                      const nextCoverItemId = album.coverItemId === item.id ? nextItemIds[0] || null : album.coverItemId;
                      try {
                        await updateAlbum({
                          albumId: album.id,
                          patch: {
                            itemIds: nextItemIds,
                            coverItemId: nextCoverItemId
                          }
                        }).unwrap();
                        setMessage('Item removed from the album.');
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : 'Could not update the album order.');
                      }
                    }}
                  >
                    Remove from album
                  </Button>
                </Stack>
              </Stack>
              <ArticleCard
                item={item}
                language={viewer.language}
                languageMode={viewer.contentLanguageMode}
                commentCount={getCommentsCountByItem(item.id)}
                showImage={viewer.imageMode === 'on'}
              />
            </Box>
          ))}
        </Box>

        {!items.length ? (
          <SectionCard title="Album is empty" eyebrow="No items">
            <Typography variant="body2" color="text.secondary">
              Save items and add them to this album from an item detail page.
            </Typography>
          </SectionCard>
        ) : null}

        {message ? <Alert severity="info">{message}</Alert> : null}
        {albumQuery.isError && !fallback ? <Alert severity="warning">Album data could not be loaded from the API.</Alert> : null}
      </Stack>
    </AppShell>
  );
}
