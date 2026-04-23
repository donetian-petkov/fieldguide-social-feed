'use client';

import { Alert, Box, Typography } from '@mui/material';

import { AppShell } from '../components/AppShell';
import { SectionCard } from '../components/SectionCard';
import { DEMO_FALLBACK_ENABLED, getAdminModel, getEmptyAdminModel } from '../lib/demo';
import { useAdminDashboardQuery } from '../lib/api';
import { useSessionViewer } from '../lib/session';

export default function AdminPage() {
  const fallback = DEMO_FALLBACK_ENABLED ? getAdminModel() : getEmptyAdminModel();
  const { viewer } = useSessionViewer();
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || fallback;

  return (
    <AppShell title="Admin" subtitle="Moderation, source control, users, AI settings, and system visibility." viewer={viewer}>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(3, minmax(0, 1fr))'
          }
        }}
      >
        <Box>
          <SectionCard title="Sources" eyebrow="Curated feed control">
            <Typography variant="h3">{model.sources.length}</Typography>
            <Typography variant="body2" color="text.secondary">
              Active or paused source definitions with editorial and adult-educational separation.
            </Typography>
          </SectionCard>
        </Box>
        <Box>
          <SectionCard title="Submissions" eyebrow="Approval queue">
            <Typography variant="h3">{model.submissions.length}</Typography>
            <Typography variant="body2" color="text.secondary">
              User links and rich posts waiting for admin approval.
            </Typography>
          </SectionCard>
        </Box>
        <Box>
          <SectionCard title="Errors" eyebrow="Backend only">
            <Typography variant="h3">{model.errorLogs.length}</Typography>
            <Typography variant="body2" color="text.secondary">
              Visible only in admin logs, never exposed through user toasts.
            </Typography>
          </SectionCard>
        </Box>
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Admin data is available only after signing in as an admin and connecting to the API.</Alert> : null}
    </AppShell>
  );
}
