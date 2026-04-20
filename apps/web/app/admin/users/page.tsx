'use client';

import { useState } from 'react';
import { Alert, Box, Button, Snackbar, Stack, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';
import { useAdminDashboardQuery, useSuspendAdminUserMutation } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AdminUsersPage() {
  const fallback = getAdminModel();
  const { viewer } = useSessionViewer(fallback.viewer);
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || fallback;
  const [toast, setToast] = useState<string | null>(null);
  const [suspendUser] = useSuspendAdminUserMutation();

  async function handleSuspend(username: string, suspended: boolean) {
    try {
      await suspendUser({ username, suspended }).unwrap();
      setToast(suspended ? 'User suspended.' : 'User restored.');
    } catch {
      setToast('Could not update the user status.');
    }
  }

  return (
    <AppShell title="Admin Users" subtitle="Roles, protected mode eligibility, and newsletter preferences." viewer={viewer}>
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
              <Stack spacing={1.25}>
                <Typography variant="body2">Current mode: {user.contentMode}</Typography>
                <Typography variant="body2">Newsletter: {user.newsletterEnabled ? 'Enabled' : 'Disabled'}</Typography>
                <Typography variant="body2">Protected modes: {user.protectedModeEnabled ? 'Allowed' : 'Disabled'}</Typography>
                <Button
                  variant="outlined"
                  size="small"
                  color={user.protectedModeEnabled ? 'error' : 'success'}
                  onClick={() => void handleSuspend(user.username, user.protectedModeEnabled)}
                >
                  {user.protectedModeEnabled ? 'Suspend User' : 'Restore User'}
                </Button>
              </Stack>
            </SectionCard>
          </Box>
        ))}
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Showing fallback user data because the admin API is unavailable.</Alert> : null}
      <Snackbar open={!!toast} autoHideDuration={2400} message={toast || ''} onClose={() => setToast(null)} />
    </AppShell>
  );
}
