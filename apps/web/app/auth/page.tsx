'use client';

import { Box, Typography } from '@mui/material';

import { AppShell } from '../components/AppShell';
import { AuthPanel } from '../components/AuthPanel';
import { SectionCard } from '../components/SectionCard';
import { demoViewer } from '../lib/demo';

export default function AuthPage() {
  return (
    <AppShell title="Account" subtitle="Login, register, and unlock protected content controls." viewer={demoViewer}>
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
          <AuthPanel />
        </Box>
        <Box>
          <SectionCard title="Why sign in?" eyebrow="Account features">
            <Typography variant="body2" color="text.secondary">
              Sign-in enables custom albums, saved articles, community submissions, protected Kid and Adult mode switching, newsletters, and account-scoped AI preferences.
            </Typography>
          </SectionCard>
        </Box>
      </Box>
    </AppShell>
  );
}
