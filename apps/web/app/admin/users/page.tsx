'use client';

import { Box, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';

export default function AdminUsersPage() {
  const model = getAdminModel();

  return (
    <AppShell title="Admin Users" subtitle="Roles, protected mode eligibility, and newsletter preferences." viewer={model.viewer}>
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
        {model.users.map((user) => (
          <Box key={user.username}>
            <SectionCard title={user.displayName} eyebrow={user.role}>
              <Typography variant="body2">Current mode: {user.contentMode}</Typography>
              <Typography variant="body2">Newsletter: {user.newsletterEnabled ? 'Enabled' : 'Disabled'}</Typography>
              <Typography variant="body2">Protected modes: {user.protectedModeEnabled ? 'Allowed' : 'Disabled'}</Typography>
            </SectionCard>
          </Box>
        ))}
      </Box>
    </AppShell>
  );
}
