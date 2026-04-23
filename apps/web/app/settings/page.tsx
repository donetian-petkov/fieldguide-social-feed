'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material';

import type { UserSettingsDto } from '@edu-feed/shared';
import { PRESET_FONT_STACKS } from '@edu-feed/shared';

import { AppShell } from '../components/AppShell';
import { ProtectedModeCard } from '../components/ProtectedModeCard';
import { SectionCard } from '../components/SectionCard';
import { getSavedAlbumsForViewer, getSettingsModel } from '../lib/demo';
import { useAlbumsQuery, useCreateAlbumMutation, useDeleteAlbumMutation, useHealthQuery, useUpdateSettingsMutation } from '../lib/api';
import { useSessionViewer } from '../lib/session';

function getMutationErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
      return (data as { error: string }).error;
    }
    if (typeof data === 'string') {
      return data;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function SignInRequiredNotice({ text }: { text: string }) {
  return (
    <Alert
      severity="info"
      action={
        <Button component={Link} href="/auth" color="inherit" size="small">
          Sign in
        </Button>
      }
    >
      {text}
    </Alert>
  );
}

export default function SettingsPage() {
  const model = getSettingsModel();
  const { viewer, isAuthenticated } = useSessionViewer(model.viewer);
  const albumsQuery = useAlbumsQuery(undefined, { skip: !isAuthenticated });
  const healthQuery = useHealthQuery();
  const [updateSettings] = useUpdateSettingsMutation();
  const [createAlbum, createAlbumState] = useCreateAlbumMutation();
  const [deleteAlbum, deleteAlbumState] = useDeleteAlbumMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [messageSeverity, setMessageSeverity] = useState<'success' | 'error'>('success');
  const [albumTitle, setAlbumTitle] = useState('');
  const [albumDescription, setAlbumDescription] = useState('');
  const albums = albumsQuery.data?.albums || getSavedAlbumsForViewer();
  const aiAvailable = Boolean(healthQuery.data?.aiAvailable);

  async function saveSettings(
    patch: Partial<UserSettingsDto>,
    successMessage: string
  ) {
    if (!isAuthenticated) {
      setMessageSeverity('error');
      setMessage('Sign in to save settings.');
      return;
    }

    try {
      await updateSettings(patch).unwrap();
      setMessageSeverity('success');
      setMessage(successMessage);
    } catch (error) {
      setMessageSeverity('error');
      setMessage(getMutationErrorMessage(error, 'Could not save the settings.'));
    }
  }

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
        {!isAuthenticated ? (
          <Alert
            severity="warning"
            sx={{ gridColumn: '1 / -1' }}
            action={
              <Button component={Link} href="/auth" color="inherit" size="small">
                Login / Register
              </Button>
            }
          >
            You are signed out. Settings below are account preferences and cannot be changed until you sign in.
          </Alert>
        ) : null}
        <Box>
          <SectionCard title="Appearance" eyebrow="Inspired by the reference project">
            {!isAuthenticated ? (
              <SignInRequiredNotice text="Sign in to change language, visual preset, theme, image visibility, and newsletter preferences." />
            ) : (
              <Stack spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Interface language</InputLabel>
                  <Select
                    label="Interface language"
                    value={viewer.language}
                    onChange={(event) => {
                      void saveSettings({ language: event.target.value as typeof viewer.language }, 'Interface language saved.');
                    }}
                  >
                    <MenuItem value="en">English</MenuItem>
                    <MenuItem value="bg">Bulgarian</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>Vibe</InputLabel>
                  <Select
                    label="Vibe"
                    value={viewer.vibePreset}
                    onChange={(event) => {
                      void saveSettings({ vibePreset: event.target.value as typeof viewer.vibePreset }, 'Vibe preference saved.');
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
                    onChange={(event) => {
                      void saveSettings({ contentLanguageMode: event.target.value as typeof viewer.contentLanguageMode }, 'Language mode saved.');
                    }}
                  >
                    <MenuItem value="single">Single</MenuItem>
                    <MenuItem value="dual">Dual</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>Theme mode</InputLabel>
                  <Select
                    label="Theme mode"
                    value={viewer.themeMode}
                    onChange={(event) => {
                      void saveSettings({ themeMode: event.target.value as typeof viewer.themeMode }, 'Theme mode saved.');
                    }}
                  >
                    <MenuItem value="light">Light</MenuItem>
                    <MenuItem value="dark">Dark</MenuItem>
                    <MenuItem value="system">System</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>Font</InputLabel>
                  <Select
                    label="Font"
                    value={viewer.fontFamily}
                    onChange={(event) => {
                      void saveSettings({ fontFamily: event.target.value }, 'Font family saved.');
                    }}
                  >
                    <MenuItem value={PRESET_FONT_STACKS.museum}>Museum serif</MenuItem>
                    <MenuItem value={PRESET_FONT_STACKS.archive}>Archive sans</MenuItem>
                    <MenuItem value={PRESET_FONT_STACKS.field_notes}>Field Notes sans</MenuItem>
                    <MenuItem value={PRESET_FONT_STACKS.cinema}>Cinema display</MenuItem>
                    <MenuItem value={PRESET_FONT_STACKS.naturalist}>Naturalist serif</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>Font size</InputLabel>
                  <Select
                    label="Font size"
                    value={viewer.fontScale}
                    onChange={(event) => {
                      void saveSettings({ fontScale: event.target.value as typeof viewer.fontScale }, 'Font size saved.');
                    }}
                  >
                    <MenuItem value="sm">Small</MenuItem>
                    <MenuItem value="md">Medium</MenuItem>
                    <MenuItem value="lg">Large</MenuItem>
                  </Select>
                </FormControl>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography>Images on/off</Typography>
                  <Switch
                    checked={viewer.imageMode === 'on'}
                    onChange={(_event, checked) => {
                      void saveSettings({ imageMode: checked ? 'on' : 'off' }, 'Image preference saved.');
                    }}
                  />
                </Stack>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography>Newsletter enabled</Typography>
                  <Switch
                    checked={viewer.newsletterEnabled}
                    onChange={(_event, checked) => {
                      void saveSettings({ newsletterEnabled: checked }, 'Newsletter preference saved.');
                    }}
                  />
                </Stack>
                <FormControl fullWidth>
                  <InputLabel>Newsletter cadence</InputLabel>
                  <Select
                    label="Newsletter cadence"
                    value={viewer.newsletterCadence}
                    onChange={(event) => {
                      void saveSettings({ newsletterCadence: event.target.value as typeof viewer.newsletterCadence }, 'Newsletter cadence saved.');
                    }}
                  >
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            )}
          </SectionCard>
        </Box>

        <Box>
          <ProtectedModeCard currentMode={viewer.contentMode} />
        </Box>

        <Box>
          <SectionCard title="Saved library" eyebrow="Albums and saved feed">
            {!isAuthenticated ? (
              <SignInRequiredNotice text="Sign in to view your saved items and create or manage albums." />
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Saved items: {model.savedCount}
                </Typography>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {albums.map((album) => (
                    <Stack
                      key={album.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      justifyContent="space-between"
                    >
                      <Typography variant="body2">
                        {album.title}: {album.itemIds.length} items
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button component={Link} href={`/albums/${album.id}`} size="small" variant="outlined">
                          Open
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={deleteAlbumState.isLoading}
                          onClick={async () => {
                            try {
                              await deleteAlbum(album.id).unwrap();
                              setMessageSeverity('success');
                              setMessage('Album deleted.');
                            } catch (error) {
                              setMessageSeverity('error');
                              setMessage(getMutationErrorMessage(error, 'Could not delete the album.'));
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
                <Stack spacing={1.5} sx={{ mt: 2.5 }}>
                  <TextField
                    label="Album title"
                    value={albumTitle}
                    onChange={(event) => setAlbumTitle(event.target.value)}
                    disabled={createAlbumState.isLoading}
                  />
                  <TextField
                    label="Album description"
                    value={albumDescription}
                    onChange={(event) => setAlbumDescription(event.target.value)}
                    disabled={createAlbumState.isLoading}
                    multiline
                    minRows={2}
                  />
                  <Button
                    variant="contained"
                    disabled={!albumTitle.trim() || createAlbumState.isLoading}
                    onClick={async () => {
                      try {
                        await createAlbum({
                          title: albumTitle.trim(),
                          description: albumDescription.trim()
                        }).unwrap();
                        setAlbumTitle('');
                        setAlbumDescription('');
                        setMessageSeverity('success');
                        setMessage('Album created.');
                      } catch (error) {
                        setMessageSeverity('error');
                        setMessage(getMutationErrorMessage(error, 'Could not create the album.'));
                      }
                    }}
                  >
                    {createAlbumState.isLoading ? 'Creating...' : 'Create album'}
                  </Button>
                </Stack>
              </>
            )}
          </SectionCard>
        </Box>

        {aiAvailable ? (
          <Box>
            <SectionCard title="AI preferences" eyebrow="Per-account controls">
              {!isAuthenticated ? (
                <SignInRequiredNotice text="Sign in to change Ask-AI availability and other account-level AI preferences." />
              ) : (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography>Ask-AI enabled</Typography>
                    <Switch
                      checked={viewer.askAiEnabled}
                      onChange={(_event, checked) => {
                        void saveSettings({ askAiEnabled: checked }, 'Ask-AI preference saved.');
                      }}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Ask-AI is enabled. Summaries, translation, and article Q&A stay bounded by admin-configured provider and budget rules.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Password verification is required to leave Standard mode and switch into Kid or Adult mode.
                  </Typography>
                </Stack>
              )}
            </SectionCard>
          </Box>
        ) : null}
      </Box>
      {message ? <Alert sx={{ mt: 3 }} severity={messageSeverity}>{message}</Alert> : null}
    </AppShell>
  );
}
