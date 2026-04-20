'use client';

import { Alert, Box, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';
import { useAdminDashboardQuery } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AdminSourcesPage() {
  const fallback = getAdminModel();
  const { viewer } = useSessionViewer(fallback.viewer);
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || fallback;

  return (
    <AppShell title="Admin Sources" subtitle="Add, edit, pause, resume, and inspect predefined feeds." viewer={viewer}>
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
        {model.sources.map((source) => (
          <Box key={source.id}>
            <SectionCard title={source.name} eyebrow={source.status}>
              <Typography variant="body2">{source.description}</Typography>
              <Typography variant="caption" color="text.secondary">
                {source.kind} • {source.language} • {source.sourceType}
              </Typography>
            </SectionCard>
          </Box>
        ))}
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Showing fallback source data because the admin API is unavailable.</Alert> : null}
    </AppShell>
  );
}
