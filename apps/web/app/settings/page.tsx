'use client';

import { useState } from 'react';
import { Alert, Box, FormControl, InputLabel, MenuItem, Select, Stack, Switch, Typography } from '@mui/material';

import { AppShell } from '../components/AppShell';
import { ProtectedModeCard } from '../components/ProtectedModeCard';
import { SectionCard } from '../components/SectionCard';
import { getSavedAlbumsForViewer, getSettingsModel } from '../lib/demo';
import { useAlbumsQuery, useUpdateSettingsMutation } from '../lib/api';
import { useSessionViewer } from '../lib/session';

export default function SettingsPage() {
  const model = getSettingsModel();
  const { viewer } = useSessionViewer(model.viewer);
  const albumsQuery = useAlbumsQuery();
  const [updateSettings] = useUpdateSettingsMutation();
  const [message, setMessage] = useState<string | null>(null);
  const albums = albumsQuery.data?.albums || getSavedAlbumsForViewer();

  return (
    <AppShell title="Settings" subtitle="Visual presets, content protection, newsletters, and AI preferences." viewer={viewer}>
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
                <Select
                  label="Vibe"
                  value={viewer.vibePreset}
                  onChange={async (event) => {
                    await updateSettings({ vibePreset: event.target.value as typeof viewer.vibePreset }).unwrap().catch(() => undefined);
                    setMessage('Vibe preference saved.');
                  }}
                >
                  <MenuItem value="museum">Museum</MenuItem>
                  <MenuItem value="archive">Archive</MenuItem>
                  <MenuItem value="field_notes">Field Notes</MenuItem>
                  <MenuItem value="cinema">Cinema</MenuItem>
                  <MenuItem value="naturalist">Naturalist</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Language mode</InputLabel>
                <Select
                  label="Language mode"
                  value={viewer.contentLanguageMode}
                  onChange={async (event) => {
                    await updateSettings({ contentLanguageMode: event.target.value as typeof viewer.contentLanguageMode }).unwrap().catch(() => undefined);
                    setMessage('Language mode saved.');
                  }}
                >
                  <MenuItem value="single">Single</MenuItem>
                  <MenuItem value="dual">Dual</MenuItem>
                </Select>
              </FormControl>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography>Images on/off</Typography>
                <Switch
                  checked={viewer.imageMode === 'on'}
                  onChange={async (_event, checked) => {
                    await updateSettings({ imageMode: checked ? 'on' : 'off' }).unwrap().catch(() => undefined);
                    setMessage('Image preference saved.');
                  }}
                />
              </Stack>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography>Newsletter enabled</Typography>
                <Switch
                  checked={viewer.newsletterEnabled}
                  onChange={async (_event, checked) => {
                    await updateSettings({ newsletterEnabled: checked }).unwrap().catch(() => undefined);
                    setMessage('Newsletter preference saved.');
                  }}
                />
              </Stack>
            </Stack>
          </SectionCard>
        </Box>

        <Box>
          <ProtectedModeCard currentMode={viewer.contentMode} />
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
      {message ? <Alert sx={{ mt: 3 }} severity="success">{message}</Alert> : null}
    </AppShell>
  );
}
