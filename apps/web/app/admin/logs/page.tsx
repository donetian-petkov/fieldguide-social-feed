'use client';

import { Alert, Box, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';
import { useAdminDashboardQuery } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AdminLogsPage() {
  const fallback = getAdminModel();
  const { viewer } = useSessionViewer(fallback.viewer);
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || fallback;

  return (
    <AppShell title="Admin Logs" subtitle="Operational visibility hidden from end users." viewer={viewer}>
      <Box sx={{ display: 'grid', gap: 2 }}>
        {model.errorLogs.map((log) => (
          <Box key={log.id}>
            <SectionCard title={log.scope} eyebrow={log.level}>
              <Typography variant="body2">{log.message}</Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(log.createdAt).toLocaleString()}
              </Typography>
            </SectionCard>
          </Box>
        ))}
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Showing fallback log data because the admin API is unavailable.</Alert> : null}
    </AppShell>
  );
}
