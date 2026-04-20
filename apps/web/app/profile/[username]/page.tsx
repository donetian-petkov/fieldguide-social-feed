'use client';

import { Stack, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { ArticleCard } from '../../components/ArticleCard';
import { SectionCard } from '../../components/SectionCard';
import { demoViewer, getCommentsCountByItem, getProfileModel } from '../../lib/demo';
import { useProfileQuery } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function ProfilePage({ params }: { params: { username: string } }) {
  const fallback = getProfileModel(params.username);
  const { viewer } = useSessionViewer(demoViewer);
  const profileQuery = useProfileQuery(params.username);
  const items = profileQuery.data?.items || fallback?.items || [];
  const username = profileQuery.data?.username || fallback?.user.username || params.username;
  const displayName = username === 'mila' ? 'Mila Petrova' : fallback?.user.displayName || username;

  if (!fallback && !profileQuery.data) {
    return (
      <AppShell title="Profile not found" subtitle="The requested user profile is missing." viewer={demoViewer}>
        <Typography variant="body1">Try the demo user profiles such as `/profile/mila`.</Typography>
      </AppShell>
    );
  }

  return (
    <AppShell title={displayName} subtitle={`@${username}`} viewer={viewer}>
      <Stack spacing={3}>
        <SectionCard title="Shared content" eyebrow="Approved profile posts">
          <Stack spacing={2}>
            {items.length ? (
              items.map((item) => (
                <ArticleCard
                  key={item.id}
                  item={item}
                  language={viewer.language}
                  languageMode={viewer.contentLanguageMode}
                  commentCount={getCommentsCountByItem(item.id)}
                />
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                This profile does not have approved community content yet.
              </Typography>
            )}
          </Stack>
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
