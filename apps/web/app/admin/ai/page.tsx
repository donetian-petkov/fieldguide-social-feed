'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';

import type { AiModelConfig } from '@edu-feed/shared';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';
import { useAdminDashboardQuery, useUpdateAiConfigMutation } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AdminAiPage() {
  const fallback = getAdminModel();
  const { viewer } = useSessionViewer(fallback.viewer);
  const adminQuery = useAdminDashboardQuery();
  const [updateAiConfig, updateState] = useUpdateAiConfigMutation();
  const model = adminQuery.data || fallback;
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<AiModelConfig>(model.aiConfig);

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
