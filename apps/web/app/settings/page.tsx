'use client';

import { Box, FormControl, InputLabel, MenuItem, Select, Stack, Switch, Typography } from '@mui/material';

import { AppShell } from '../components/AppShell';
import { ProtectedModeCard } from '../components/ProtectedModeCard';
import { SectionCard } from '../components/SectionCard';
import { getSavedAlbumsForViewer, getSettingsModel } from '../lib/demo';

export default function SettingsPage() {
  const model = getSettingsModel();
  const albums = getSavedAlbumsForViewer();

  return (
    <AppShell title="Settings" subtitle="Visual presets, content protection, newsletters, and AI preferences." viewer={model.viewer}>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))'
          }
        }}
      >
        <Box>
          <SectionCard title="Appearance" eyebrow="Inspired by the reference project">
            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Vibe</InputLabel>
                <Select label="Vibe" defaultValue={model.viewer.vibePreset}>
                  <MenuItem value="museum">Museum</MenuItem>
                  <MenuItem value="archive">Archive</MenuItem>
                  <MenuItem value="field_notes">Field Notes</MenuItem>
                  <MenuItem value="cinema">Cinema</MenuItem>
                  <MenuItem value="naturalist">Naturalist</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Language mode</InputLabel>
                <Select label="Language mode" defaultValue={model.viewer.contentLanguageMode}>
                  <MenuItem value="single">Single</MenuItem>
                  <MenuItem value="dual">Dual</MenuItem>
                </Select>
              </FormControl>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography>Images on/off</Typography>
                <Switch defaultChecked={model.viewer.imageMode === 'on'} />
              </Stack>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography>Newsletter enabled</Typography>
                <Switch defaultChecked={model.viewer.newsletterEnabled} />
              </Stack>
            </Stack>
          </SectionCard>
        </Box>

        <Box>
          <ProtectedModeCard currentMode={model.viewer.contentMode} />
        </Box>

        <Box>
          <SectionCard title="Saved library" eyebrow="Albums and saved feed">
            <Typography variant="body2" color="text.secondary">
              Saved items: {model.savedCount}
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {albums.map((album) => (
                <Typography key={album.id} variant="body2">
                  {album.title}: {album.itemIds.length} items
                </Typography>
              ))}
            </Stack>
          </SectionCard>
        </Box>

        <Box>
          <SectionCard title="AI preferences" eyebrow="Per-account controls">
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Ask-AI is enabled. Summaries, translation, and article Q&A stay bounded by admin-configured provider and budget rules.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Password verification is required to leave Standard mode and switch into Kid or Adult mode.
              </Typography>
            </Stack>
          </SectionCard>
        </Box>
      </Box>
    </AppShell>
  );
}
