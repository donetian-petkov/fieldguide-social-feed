'use client';

import { Stack, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { ArticleCard } from '../../components/ArticleCard';
import { SectionCard } from '../../components/SectionCard';
import { demoViewer, getCommentsCountByItem, getProfileModel } from '../../lib/demo';

export default function ProfilePage({ params }: { params: { username: string } }) {
  const model = getProfileModel(params.username);
  if (!model) {
    return (
      <AppShell title="Profile not found" subtitle="The requested user profile is missing." viewer={demoViewer}>
        <Typography variant="body1">Try the demo user profiles such as `/profile/mila`.</Typography>
      </AppShell>
    );
  }

  return (
    <AppShell title={model.user.displayName} subtitle={`@${model.user.username}`} viewer={demoViewer}>
      <Stack spacing={3}>
        <SectionCard title="Shared content" eyebrow="Approved profile posts">
          <Stack spacing={2}>
            {model.items.length ? (
              model.items.map((item) => (
                <ArticleCard
                  key={item.id}
                  item={item}
                  language={demoViewer.language}
                  languageMode={demoViewer.contentLanguageMode}
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
