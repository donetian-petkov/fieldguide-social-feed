'use client';

import { useState } from 'react';
import type { UserSettingsDto } from '@edu-feed/shared';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { DEMO_FALLBACK_ENABLED, getAdminModel, getEmptyAdminModel } from '../../lib/demo';
import { useAdminDashboardQuery, useSetAdminUserRoleMutation, useSuspendAdminUserMutation } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AdminUsersPage() {
  const fallback = DEMO_FALLBACK_ENABLED ? getAdminModel() : getEmptyAdminModel();
  const { viewer } = useSessionViewer();
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || fallback;
  const [toast, setToast] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserSettingsDto['role']>>({});
  const [suspendUser] = useSuspendAdminUserMutation();
  const [setUserRole, setUserRoleState] = useSetAdminUserRoleMutation();

  async function handleSuspend(username: string, suspended: boolean) {
    try {
      await suspendUser({ username, suspended }).unwrap();
      setToast(suspended ? 'User suspended.' : 'User restored.');
    } catch {
      setToast('Could not update the user status.');
    }
  }

  async function handleRoleSave(username: string, role: UserSettingsDto['role']) {
    try {
      await setUserRole({ username, role }).unwrap();
      setRoleDrafts((current) => {
        const next = { ...current };
        delete next[username];
        return next;
      });
      setToast('User role updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update the user role.';
      setToast(message);
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
        {model.users.map((user) => {
          const draftRole = roleDrafts[user.username] || user.role;

          return (
            <Box key={user.username}>
              <SectionCard title={user.displayName} eyebrow={user.role}>
                <Stack spacing={1.25}>
                  <Typography variant="body2">Current mode: {user.contentMode}</Typography>
                  <Typography variant="body2">Newsletter: {user.newsletterEnabled ? 'Enabled' : 'Disabled'}</Typography>
                  <Typography variant="body2">Protected modes: {user.protectedModeEnabled ? 'Allowed' : 'Disabled'}</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel id={`role-select-${user.username}`}>Role</InputLabel>
                      <Select
                        labelId={`role-select-${user.username}`}
                        label="Role"
                        value={draftRole}
                        onChange={(event) =>
                          setRoleDrafts((current) => ({
                            ...current,
                            [user.username]: event.target.value as UserSettingsDto['role']
                          }))
                        }
                      >
                        <MenuItem value="user">User</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={draftRole === user.role || setUserRoleState.isLoading}
                      onClick={() => void handleRoleSave(user.username, draftRole)}
                    >
                      Save Role
                    </Button>
                  </Stack>
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
          );
        })}
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Admin user data could not be loaded from the API.</Alert> : null}
      <Snackbar open={!!toast} autoHideDuration={2400} message={toast || ''} onClose={() => setToast(null)} />
    </AppShell>
  );
}
