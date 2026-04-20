'use client';

import { Alert, Box, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';
import { useAdminDashboardQuery } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AdminModerationPage() {
  const fallback = getAdminModel();
  const { viewer } = useSessionViewer(fallback.viewer);
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || fallback;

  return (
    <AppShell title="Admin Moderation" subtitle="Comment locks, article tags, removals, and the submission queue." viewer={viewer}>
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
        {model.submissions.map((submission) => (
          <Box key={submission.id}>
            <SectionCard title={submission.title} eyebrow={submission.status}>
              <Typography variant="body2">
                Type: {submission.type}. Submitted by {submission.submittedBy}.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {submission.body || submission.sourceUrl}
              </Typography>
            </SectionCard>
          </Box>
        ))}
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Showing fallback moderation data because the admin API is unavailable.</Alert> : null}
    </AppShell>
  );
}
