'use client';

import { useState } from 'react';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';

import { AppShell } from '../components/AppShell';
import { ArticleCard } from '../components/ArticleCard';
import { FeedToolbar } from '../components/FeedToolbar';
import { SectionCard } from '../components/SectionCard';
import { DEMO_FALLBACK_ENABLED, getCommentsCountByItem, getFeedModel } from '../lib/demo';
import { useCreateSubmissionMutation, useFeedQuery } from '../lib/api';
import { useSessionViewer } from '../lib/session';

type SubmissionType = 'link' | 'community_post';

export default function CommunityPage() {
  const fallback = getFeedModel('community');
  const { viewer, isAuthenticated } = useSessionViewer();
  const feedQuery = useFeedQuery({ feed: 'community' });
  const [createSubmission, createSubmissionState] = useCreateSubmissionMutation();
  const [submissionType, setSubmissionType] = useState<SubmissionType>('link');
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const items = feedQuery.data?.items || (DEMO_FALLBACK_ENABLED ? fallback.items : []);

  return (
    <AppShell
      title={fallback.title}
      subtitle="Approved community links and essays stay separate from the curated editorial source feeds."
      viewer={viewer}
    >
      <Stack spacing={3}>
        <FeedToolbar feed="community" language={viewer.language} />

        <SectionCard title="Submit to community" eyebrow="Moderated queue">
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              Share a source link or publish a richer post for admin review. Approved submissions appear only in Community and on the author profile.
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Submission type</InputLabel>
              <Select
                label="Submission type"
                value={submissionType}
                onChange={(event) => setSubmissionType(event.target.value as SubmissionType)}
                disabled={!isAuthenticated || createSubmissionState.isLoading}
              >
                <MenuItem value="link">Link</MenuItem>
                <MenuItem value="community_post">Community post</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!isAuthenticated || createSubmissionState.isLoading}
            />
            {submissionType === 'link' ? (
              <TextField
                label="Source URL"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                disabled={!isAuthenticated || createSubmissionState.isLoading}
              />
            ) : (
              <TextField
                label="Post body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={!isAuthenticated || createSubmissionState.isLoading}
                multiline
                minRows={5}
              />
            )}
            <Button
              variant="contained"
              disabled={
                !isAuthenticated ||
                !title.trim() ||
                (submissionType === 'link' ? !sourceUrl.trim() : !body.trim()) ||
                createSubmissionState.isLoading
              }
              onClick={async () => {
                try {
                  await createSubmission({
                    type: submissionType,
                    title: title.trim(),
                    sourceUrl: submissionType === 'link' ? sourceUrl.trim() : null,
                    body: submissionType === 'community_post' ? body.trim() : null
                  }).unwrap();
                  setTitle('');
                  setSourceUrl('');
                  setBody('');
                  setMessage('Submission sent to the moderation queue.');
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Could not submit this post.');
                }
              }}
            >
              {createSubmissionState.isLoading ? 'Submitting...' : 'Submit for review'}
            </Button>
            {!isAuthenticated ? (
              <Typography variant="caption" color="text.secondary">
                Sign in to submit to the community feed.
              </Typography>
            ) : null}
            {message ? <Alert severity="info">{message}</Alert> : null}
          </Stack>
        </SectionCard>

        <Stack spacing={2}>
          {items.map((item) => (
            <ArticleCard
              key={item.id}
              item={item}
              language={viewer.language}
              languageMode={viewer.contentLanguageMode}
              commentCount={getCommentsCountByItem(item.id)}
              showImage={viewer.imageMode === 'on'}
            />
          ))}
        </Stack>

        {feedQuery.isError ? (
          <Box>
            <Alert severity="warning">Community feed data could not be loaded from the API.</Alert>
          </Box>
        ) : null}
      </Stack>
    </AppShell>
  );
}
