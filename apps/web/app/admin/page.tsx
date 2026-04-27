'use client';

import Link from 'next/link';
import { Alert, Box, Typography } from '@mui/material';
import { Button, Stack } from '@mui/material';

import { AdminSectionNav } from '../components/AdminSectionNav';
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
  const cards = [
    {
      title: 'Sources',
      eyebrow: 'Curated feed control',
      metric: `${model.sources.length}`,
      description: 'Add sources, pause or resume feeds, and queue a manual resync.',
      href: '/admin/sources',
      cta: 'Manage sources'
    },
    {
      title: 'Moderation',
      eyebrow: 'Approval queue',
      metric: `${model.submissions.length}`,
      description: 'Approve community submissions, lock comments, pin items, and remove content.',
      href: '/admin/moderation',
      cta: 'Open moderation'
    },
    {
      title: 'Users',
      eyebrow: 'Role and access control',
      metric: `${model.users.length}`,
      description: 'Promote admins, suspend accounts, and inspect protected-mode eligibility.',
      href: '/admin/users',
      cta: 'Manage users'
    },
    {
      title: 'AI',
      eyebrow: 'Provider and budgets',
      metric: model.aiConfig.provider.toUpperCase(),
      description: 'Change provider and models, inspect spend, and review generated story drafts.',
      href: '/admin/ai',
      cta: 'Open AI controls'
    },
    {
      title: 'Usage',
      eyebrow: 'Token and cost charts',
      metric: 'Charts',
      description: 'Review monthly token usage, estimated cost, purposes, and model mix in one place.',
      href: '/admin/usage',
      cta: 'Open usage'
    },
    {
      title: 'Logs',
      eyebrow: 'Backend only',
      metric: `${model.errorLogs.length}`,
      description: 'Inspect backend failures and integration warnings hidden from regular users.',
      href: '/admin/logs',
      cta: 'Review logs'
    }
  ];

  return (
    <AppShell title="Admin" subtitle="Moderation, source control, users, AI settings, and system visibility." viewer={viewer}>
      <Box
        sx={{
          display: 'grid',
          gap: 3
        }}
      >
        <AdminSectionNav />
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
          {cards.map((card) => (
            <Box key={card.href}>
              <SectionCard title={card.title} eyebrow={card.eyebrow}>
                <Stack spacing={2}>
                  <Typography variant="h3">{card.metric}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {card.description}
                  </Typography>
                  <Button component={Link} href={card.href} variant="contained" sx={{ alignSelf: 'flex-start' }}>
                    {card.cta}
                  </Button>
                </Stack>
              </SectionCard>
            </Box>
          ))}
        </Box>
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Admin data is available only after signing in as an admin and connecting to the API.</Alert> : null}
    </AppShell>
  );
}
