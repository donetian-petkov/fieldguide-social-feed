'use client';

import { Box, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';

export default function AdminLogsPage() {
  const model = getAdminModel();

  return (
    <AppShell title="Admin Logs" subtitle="Operational visibility hidden from end users." viewer={model.viewer}>
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
    </AppShell>
  );
}
