'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import type { SourceDefinition, SubjectTag } from '@edu-feed/shared';

import { AdminSectionNav } from '../../components/AdminSectionNav';
import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { DEMO_FALLBACK_ENABLED, getAdminModel, getEmptyAdminModel } from '../../lib/demo';
import {
  useAddSourceMutation,
  useAdminDashboardQuery,
  useDeleteSourceMutation,
  useResyncSourceMutation,
  useUpdateSourceMutation
} from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

const subjectOptions: Array<{ value: SubjectTag; label: string }> = [
  { value: 'history', label: 'History' },
  { value: 'art', label: 'Art' },
  { value: 'books', label: 'Books' },
  { value: 'movies', label: 'Movies' },
  { value: 'country_knowledge', label: 'Country Knowledge' },
  { value: 'photography', label: 'Photography' },
  { value: 'nature', label: 'Nature' },
  { value: 'video', label: 'Video' },
  { value: 'community', label: 'Community' }
];

const defaultForm: Omit<SourceDefinition, 'id'> = {
  name: '',
  slug: '',
  iconUrl: '',
  siteUrl: '',
  feedUrl: '',
  kind: 'rss',
  status: 'active',
  sourceType: 'editorial',
  subjects: ['history'],
  defaultAudience: 'standard_only',
  language: 'en',
  description: ''
};

export default function AdminSourcesPage() {
  const fallback = DEMO_FALLBACK_ENABLED ? getAdminModel() : getEmptyAdminModel();
  const { viewer } = useSessionViewer();
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || fallback;
  const [form, setForm] = useState<Omit<SourceDefinition, 'id'>>(defaultForm);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeResyncId, setActiveResyncId] = useState<string | null>(null);
  const [addSource, addSourceState] = useAddSourceMutation();
  const [updateSource, updateSourceState] = useUpdateSourceMutation();
  const [deleteSource, deleteSourceState] = useDeleteSourceMutation();
  const [resyncSource] = useResyncSourceMutation();

  const sourceCards = useMemo(() => model.sources, [model.sources]);

  async function handleSubmit() {
    try {
      if (editingSourceId) {
        await updateSource({
          sourceId: editingSourceId,
          patch: form
        }).unwrap();
        setToast('Source updated.');
      } else {
        await addSource(form).unwrap();
        setToast('Source saved and polling scheduled.');
      }
      setEditingSourceId(null);
      setForm(defaultForm);
    } catch {
      setToast(editingSourceId ? 'Could not update the source right now.' : 'Could not save the source right now.');
    }
  }

  async function handleResync(sourceId: string) {
    setActiveResyncId(sourceId);
    try {
      await resyncSource(sourceId).unwrap();
      setToast('Source resync queued.');
    } catch {
      setToast('Could not queue the source resync.');
    } finally {
      setActiveResyncId(null);
    }
  }

  async function handleStatusToggle(source: SourceDefinition) {
    const nextStatus = source.status === 'active' ? 'paused' : 'active';
    try {
      await updateSource({
        sourceId: source.id,
        patch: {
          status: nextStatus
        }
      }).unwrap();
      setToast(nextStatus === 'active' ? 'Source resumed.' : 'Source paused.');
    } catch {
      setToast('Could not change the source status.');
    }
  }

  async function handleDeleteSource(sourceId: string) {
    try {
      await deleteSource(sourceId).unwrap();
      if (editingSourceId === sourceId) {
        setEditingSourceId(null);
        setForm(defaultForm);
      }
      setToast('Source deleted.');
    } catch {
      setToast('Could not delete the source.');
    }
  }

  return (
    <AppShell title="Admin Sources" subtitle="Add, edit, pause, resume, and inspect predefined feeds." viewer={viewer}>
      <Box sx={{ display: 'grid', gap: 3 }}>
        <AdminSectionNav />
        <SectionCard title={editingSourceId ? 'Edit Source' : 'Add Source'} eyebrow="Curated ingestion">
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(2, minmax(0, 1fr))'
              }
            }}
          >
            <TextField label="Name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <TextField label="Slug" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))} />
            <TextField label="Icon URL" value={form.iconUrl} onChange={(event) => setForm((current) => ({ ...current, iconUrl: event.target.value }))} />
            <TextField label="Site URL" value={form.siteUrl} onChange={(event) => setForm((current) => ({ ...current, siteUrl: event.target.value }))} />
            <TextField label="Feed URL" value={form.feedUrl} onChange={(event) => setForm((current) => ({ ...current, feedUrl: event.target.value }))} />
            <TextField
              label="Kind"
              select
              value={form.kind}
              onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as SourceDefinition['kind'] }))}
            >
              <MenuItem value="rss">RSS / Atom</MenuItem>
              <MenuItem value="youtube">YouTube RSS</MenuItem>
              <MenuItem value="custom">Custom Adapter</MenuItem>
            </TextField>
            <TextField
              label="Status"
              select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SourceDefinition['status'] }))}
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="paused">Paused</MenuItem>
              <MenuItem value="error">Error</MenuItem>
            </TextField>
            <TextField
              label="Source Type"
              select
              value={form.sourceType}
              onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value as SourceDefinition['sourceType'] }))}
            >
              <MenuItem value="editorial">Editorial</MenuItem>
              <MenuItem value="community">Community</MenuItem>
              <MenuItem value="adult_educational">Adult Educational</MenuItem>
            </TextField>
            <TextField
              label="Default Audience"
              select
              value={form.defaultAudience}
              onChange={(event) => setForm((current) => ({ ...current, defaultAudience: event.target.value as SourceDefinition['defaultAudience'] }))}
            >
              <MenuItem value="kid_safe">Kid Safe</MenuItem>
              <MenuItem value="standard_only">Standard Only</MenuItem>
              <MenuItem value="adult_only">Adult Only</MenuItem>
            </TextField>
            <TextField
              label="Language"
              select
              value={form.language}
              onChange={(event) => setForm((current) => ({ ...current, language: event.target.value as SourceDefinition['language'] }))}
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="bg">Bulgarian</MenuItem>
            </TextField>
            <TextField
              label="Subjects"
              select
              SelectProps={{
                multiple: true,
                renderValue: (selected) =>
                  (selected as SubjectTag[])
                    .map((value) => subjectOptions.find((option) => option.value === value)?.label || value)
                    .join(', ')
              }}
              value={form.subjects}
              onChange={(event) => {
                const nextValue = event.target.value;
                setForm((current) => ({
                  ...current,
                  subjects: (Array.isArray(nextValue) ? nextValue : `${nextValue}`.split(',')) as SubjectTag[]
                }));
              }}
            >
              {subjectOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description"
              multiline
              minRows={4}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              sx={{
                gridColumn: {
                  xs: '1 / -1',
                  md: '1 / -1'
                }
              }}
            />
          </Box>
          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
            <Button
              variant="contained"
              onClick={() => void handleSubmit()}
              disabled={addSourceState.isLoading || updateSourceState.isLoading}
            >
              {addSourceState.isLoading || updateSourceState.isLoading
                ? 'Saving...'
                : editingSourceId
                  ? 'Update Source'
                  : 'Save Source'}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setEditingSourceId(null);
                setForm(defaultForm);
              }}
            >
              {editingSourceId ? 'Cancel Edit' : 'Reset'}
            </Button>
          </Stack>
        </SectionCard>

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))'
            }
          }}
        >
          {sourceCards.map((source) => (
            <Box key={source.id}>
              <SectionCard title={source.name} eyebrow={source.status}>
                <Stack spacing={1.25}>
                  <Typography variant="body2">{source.description}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {source.kind} • {source.language} • {source.sourceType}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {source.subjects.map((subject) => (
                      <Chip key={`${source.id}-${subject}`} size="small" label={subject.replace('_', ' ')} />
                    ))}
                    <Chip size="small" color="warning" label={source.defaultAudience.replace('_', ' ')} />
                  </Stack>
                  <Stack direction="row" spacing={1.5}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        setEditingSourceId(source.id);
                        setForm({
                          name: source.name,
                          slug: source.slug,
                          iconUrl: source.iconUrl,
                          siteUrl: source.siteUrl,
                          feedUrl: source.feedUrl,
                          kind: source.kind,
                          status: source.status,
                          sourceType: source.sourceType,
                          subjects: source.subjects,
                          defaultAudience: source.defaultAudience,
                          language: source.language,
                          description: source.description
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="outlined" size="small" onClick={() => void handleStatusToggle(source)}>
                      {source.status === 'active' ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      onClick={() => void handleDeleteSource(source.id)}
                      disabled={deleteSourceState.isLoading}
                    >
                      Delete
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => void handleResync(source.id)}
                      disabled={activeResyncId === source.id}
                    >
                      {activeResyncId === source.id ? 'Queueing...' : 'Queue Resync'}
                    </Button>
                    <Button variant="text" size="small" href={source.feedUrl} target="_blank" rel="noreferrer">
                      Open Feed
                    </Button>
                  </Stack>
                </Stack>
              </SectionCard>
            </Box>
          ))}
        </Box>
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Admin source data could not be loaded from the API.</Alert> : null}
      <Snackbar open={!!toast} autoHideDuration={2600} message={toast || ''} onClose={() => setToast(null)} />
    </AppShell>
  );
}
