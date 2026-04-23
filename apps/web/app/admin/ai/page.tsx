'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';

import type { AiModelConfig, GeneratedStoryDraftDto, SubjectTag } from '@edu-feed/shared';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';
import {
  useAdminDashboardQuery,
  useHealthQuery,
  useRequestGeneratedStoryMutation,
  useReviewGeneratedStoryMutation,
  useUpdateAiConfigMutation
} from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

const SUBJECT_OPTIONS: Array<{ value: SubjectTag; label: string }> = [
  { value: 'history', label: 'History' },
  { value: 'art', label: 'Art' },
  { value: 'books', label: 'Books' },
  { value: 'movies', label: 'Movies' },
  { value: 'country_knowledge', label: 'Country Knowledge' },
  { value: 'photography', label: 'Photography' },
  { value: 'nature', label: 'Nature' },
  { value: 'video', label: 'Videos' }
];

function draftStatusCopy(draft: GeneratedStoryDraftDto) {
  if (draft.status === 'queued') return 'Queued for worker generation';
  if (draft.status === 'draft') return `Verifier passed at ${(draft.verification?.score || 0).toFixed(2)}`;
  if (draft.status === 'approved') return `Approved${draft.itemId ? ` into ${draft.itemId}` : ''}`;
  if (draft.status === 'failed') return draft.failureReason || 'Generation failed';
  return 'Rejected by admin';
}

export default function AdminAiPage() {
  const fallback = getAdminModel();
  const { viewer } = useSessionViewer(fallback.viewer);
  const adminQuery = useAdminDashboardQuery();
  const healthQuery = useHealthQuery();
  const [updateAiConfig, updateState] = useUpdateAiConfigMutation();
  const [requestGeneratedStory, requestState] = useRequestGeneratedStoryMutation();
  const [reviewGeneratedStory, reviewState] = useReviewGeneratedStoryMutation();
  const model = adminQuery.data || fallback;
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<AiModelConfig>(model.aiConfig);
  const [storySubject, setStorySubject] = useState<SubjectTag>('history');
  const [storyPrompt, setStoryPrompt] = useState('');
  const aiAvailable = Boolean(healthQuery.data?.aiAvailable);

  useEffect(() => {
    setForm(model.aiConfig);
  }, [model.aiConfig]);

  const setField = <K extends keyof AiModelConfig>(key: K, value: AiModelConfig[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  async function handleSave() {
    try {
      await updateAiConfig(form).unwrap();
      setToast('AI configuration saved.');
    } catch {
      setToast('Could not save AI configuration.');
    }
  }

  async function handleGenerateStory() {
    try {
      await requestGeneratedStory({
        subject: storySubject,
        prompt: storyPrompt
      }).unwrap();
      setStoryPrompt('');
      setToast('Generated story draft queued.');
    } catch {
      setToast('Could not queue generated story draft.');
    }
  }

  async function handleReviewDraft(draftId: string, decision: 'approved' | 'rejected') {
    try {
      await reviewGeneratedStory({ draftId, decision }).unwrap();
      setToast(decision === 'approved' ? 'Generated story approved.' : 'Generated story rejected.');
    } catch {
      setToast('Could not review generated story.');
    }
  }

  return (
    <AppShell title="Admin AI" subtitle="Provider, models, budgets, and usage tracking." viewer={viewer}>
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
          <SectionCard title="Configuration" eyebrow={form.provider}>
            <Stack spacing={2}>
              <TextField
                select
                label="Provider"
                value={form.provider}
                onChange={(event) => setField('provider', event.target.value as AiModelConfig['provider'])}
              >
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="anthropic">Anthropic</MenuItem>
                <MenuItem value="openrouter">OpenRouter</MenuItem>
              </TextField>
              <TextField
                label="Summary model"
                value={form.summaryModel}
                onChange={(event) => setField('summaryModel', event.target.value)}
              />
              <TextField
                label="Translation model"
                value={form.translationModel}
                onChange={(event) => setField('translationModel', event.target.value)}
              />
              <TextField
                label="Ask model"
                value={form.askModel}
                onChange={(event) => setField('askModel', event.target.value)}
              />
              <TextField
                label="Newsletter model"
                value={form.newsletterModel}
                onChange={(event) => setField('newsletterModel', event.target.value)}
              />
              <TextField
                label="Monthly budget (USD)"
                type="number"
                inputProps={{ min: 0, step: 0.01 }}
                value={form.monthlyBudgetUsd}
                onChange={(event) => setField('monthlyBudgetUsd', Number(event.target.value) || 0)}
              />
              <TextField
                label="Per-job budget (USD)"
                type="number"
                inputProps={{ min: 0, step: 0.01 }}
                value={form.perJobBudgetUsd}
                onChange={(event) => setField('perJobBudgetUsd', Number(event.target.value) || 0)}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.autoDowngrade}
                    onChange={(_event, checked) => setField('autoDowngrade', checked)}
                  />
                }
                label="Auto-downgrade when over budget"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.pauseOnBudgetExceeded}
                    onChange={(_event, checked) => setField('pauseOnBudgetExceeded', checked)}
                  />
                }
                label="Pause provider work when monthly budget is exceeded"
              />
              <Button variant="contained" onClick={() => void handleSave()} disabled={updateState.isLoading}>
                {updateState.isLoading ? 'Saving...' : 'Save AI Config'}
              </Button>
            </Stack>
          </SectionCard>
        </Box>
        <Box>
          <SectionCard title="Recent usage" eyebrow="Ledger">
            <Stack spacing={1.25}>
              {model.aiUsage.map((usage, index) => (
                <Typography variant="body2" key={`${usage.model}-${index}`}>
                  {usage.purpose}: {usage.provider} / {usage.model} • ${usage.totalCostUsd}
                </Typography>
              ))}
            </Stack>
          </SectionCard>
        </Box>
        {aiAvailable ? (
          <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}>
          <SectionCard title="Manual generated stories" eyebrow="Admin approval only">
            <Stack spacing={2.5}>
              <Alert severity="info">
                Phase 1 creates verifier-scored drafts only. Nothing enters the feed until an admin approves it here.
              </Alert>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: {
                    xs: '1fr',
                    md: '220px 1fr auto'
                  },
                  alignItems: 'start'
                }}
              >
                <TextField
                  select
                  label="Subject"
                  value={storySubject}
                  onChange={(event) => setStorySubject(event.target.value as SubjectTag)}
                >
                  {SUBJECT_OPTIONS.map((subject) => (
                    <MenuItem key={subject.value} value={subject.value}>
                      {subject.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Draft request"
                  placeholder="Example: Build a short educational story about why Roman road networks still matter."
                  value={storyPrompt}
                  onChange={(event) => setStoryPrompt(event.target.value)}
                  multiline
                  minRows={2}
                />
                <Button
                  variant="contained"
                  onClick={() => void handleGenerateStory()}
                  disabled={requestState.isLoading || storyPrompt.trim().length < 12}
                  sx={{ minWidth: 160 }}
                >
                  {requestState.isLoading ? 'Queueing...' : 'Generate Draft'}
                </Button>
              </Box>
              <Divider />
              <Stack spacing={2}>
                {(model.generatedStories || []).length ? (
                  model.generatedStories.map((draft) => (
                    <Box
                      key={draft.id}
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 3,
                        p: 2
                      }}
                    >
                      <Stack spacing={1}>
                        <Typography variant="overline">
                          {draft.subject.replace('_', ' ')} • {draft.status} • ${draft.totalCostUsd.toFixed(4)}
                        </Typography>
                        <Typography variant="h6">{draft.title || draft.prompt}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {draftStatusCopy(draft)}
                        </Typography>
                        {draft.summary ? <Typography variant="body2">{draft.summary}</Typography> : null}
                        {draft.citations.length ? (
                          <Typography variant="caption" color="text.secondary">
                            Citations: {draft.citations.map((citation) => citation.sourceName).join(', ')}
                          </Typography>
                        ) : null}
                        {draft.verification?.unsupportedClaims.length ? (
                          <Alert severity="warning">
                            Unsupported claims: {draft.verification.unsupportedClaims.join('; ')}
                          </Alert>
                        ) : null}
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => void handleReviewDraft(draft.id, 'approved')}
                            disabled={draft.status !== 'draft' || reviewState.isLoading}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => void handleReviewDraft(draft.id, 'rejected')}
                            disabled={!['queued', 'draft', 'failed'].includes(draft.status) || reviewState.isLoading}
                          >
                            Reject
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No generated story drafts yet.
                  </Typography>
                )}
              </Stack>
            </Stack>
          </SectionCard>
          </Box>
        ) : null}
      </Box>
      {adminQuery.isError ? (
        <Alert sx={{ mt: 3 }} severity="warning">
          Showing fallback AI settings because the admin API is unavailable.
        </Alert>
      ) : null}
      <Snackbar open={!!toast} autoHideDuration={2600} message={toast || ''} onClose={() => setToast(null)} />
    </AppShell>
  );
}
