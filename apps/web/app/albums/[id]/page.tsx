'use client';

import { Box, Stack, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { ArticleCard } from '../../components/ArticleCard';
import { SectionCard } from '../../components/SectionCard';
import { demoViewer, getAlbumCover, getAlbumModel, getCommentsCountByItem } from '../../lib/demo';

export default function AlbumPage({ params }: { params: { id: string } }) {
  const model = getAlbumModel(params.id);
  if (!model) {
    return (
      <AppShell title="Album not found" subtitle="This album does not exist in the demo dataset." viewer={demoViewer}>
        <Typography variant="body1">Open a saved album from the settings page or saved feed.</Typography>
      </AppShell>
    );
  }

  const cover = getAlbumCover(model.album);

  return (
    <AppShell title={model.album.title} subtitle={model.album.description} viewer={demoViewer}>
      <Stack spacing={3}>
        {cover ? (
          <SectionCard title="Album cover" eyebrow="Curated collection">
            <img src={cover.coverImageUrl} alt={cover.originalTitle} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 16 }} />
          </SectionCard>
        ) : null}

        <Box sx={{ display: 'grid', gap: 2 }}>
          {model.items.map((item) => (
            <Box key={item.id}>
              <ArticleCard
                item={item}
                language={demoViewer.language}
                languageMode={demoViewer.contentLanguageMode}
                commentCount={getCommentsCountByItem(item.id)}
              />
            </Box>
          ))}
        </Box>
      </Stack>
    </AppShell>
  );
}
