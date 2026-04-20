'use client';

import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import { useState } from 'react';
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { AskAiCard } from '../../components/AskAiCard';
import { ArticleCard } from '../../components/ArticleCard';
import { SectionCard } from '../../components/SectionCard';
import { getItemModel, demoViewer } from '../../lib/demo';
import { useCreateCommentMutation, useItemQuery } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function ItemPage({ params }: { params: { slug: string } }) {
  const fallback = getItemModel(params.slug);
  const { viewer, isAuthenticated } = useSessionViewer(demoViewer);
  const itemQuery = useItemQuery(params.slug);
  const [createComment, createCommentState] = useCreateCommentMutation();
  const [commentBody, setCommentBody] = useState('');
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const item = itemQuery.data?.item || fallback?.item || null;
  const comments = itemQuery.data?.comments || fallback?.comments || [];
  const relatedItems = fallback?.relatedItems || [];
  const translation = item ? item.translations.find((entry) => entry.language === viewer.language) || item.translations[0] : null;

  if (!item || !translation) {
    return (
      <AppShell title="Item not found" subtitle="The requested article or video does not exist in the demo dataset." viewer={demoViewer}>
        <Typography variant="body1">Try another item from the main feed.</Typography>
      </AppShell>
    );
  }

  return (
    <AppShell title={translation.title || item.originalTitle} subtitle={item.sourceName} viewer={viewer}>
      <Stack spacing={3}>
        <Box
          component="img"
          src={item.coverImageUrl}
          alt={translation.title || item.originalTitle}
          sx={{ width: '100%', height: { xs: 240, md: 380 }, objectFit: 'cover', borderRadius: 4 }}
        />

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {item.tags.map((tag) => (
            <Chip key={tag.id} label={tag.label} />
          ))}
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: {
              xs: '1fr',
              md: 'minmax(0, 2fr) minmax(300px, 1fr)'
            }
          }}
        >
          <Box>
            <Stack spacing={3}>
              <SectionCard title="Summary" eyebrow="AI translated and compressed">
                <Typography variant="body1">{translation.summary}</Typography>
                {item.bodyMarkdown ? (
                  <Typography variant="body2" color="text.secondary">
                    {item.bodyMarkdown}
                  </Typography>
                ) : null}
              </SectionCard>

              <SectionCard title="Comments" eyebrow="Flat thread">
                <Stack id="comments" spacing={2}>
                  {comments.map((comment) => (
                    <Box key={comment.id} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
                      <Typography variant="subtitle2">{comment.authorDisplayName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(comment.createdAt).toLocaleString()}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {comment.body}
                      </Typography>
                    </Box>
                  ))}
                  <TextField
                    multiline
                    minRows={3}
                    label="Add a comment"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder={isAuthenticated ? 'Add your comment' : 'Login to comment'}
                    disabled={!isAuthenticated}
                  />
                  <Button
                    variant="contained"
                    disabled={!isAuthenticated || !commentBody.trim() || createCommentState.isLoading}
                    onClick={async () => {
                      try {
                        await createComment({
                          itemId: item.id,
                          body: commentBody
                        }).unwrap();
                        setCommentBody('');
                        setCommentMessage('Comment submitted.');
                      } catch (error) {
                        setCommentMessage(error instanceof Error ? error.message : 'Comment request failed.');
                      }
                    }}
                  >
                    {createCommentState.isLoading ? 'Posting...' : 'Post comment'}
                  </Button>
                  {commentMessage ? <Alert severity="info">{commentMessage}</Alert> : null}
                </Stack>
              </SectionCard>
            </Stack>
          </Box>

          <Box>
            <Stack spacing={3}>
              <AskAiCard item={item} language={viewer.language} />
              <SectionCard title="Original source" eyebrow="Outbound">
                <Button
                  component="a"
                  href={item.externalUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  endIcon={<ArrowOutwardRoundedIcon />}
                  variant="contained"
                >
                  Read or watch the original
                </Button>
              </SectionCard>
            </Stack>
          </Box>
        </Box>

        <SectionCard title="Related items" eyebrow="More to research">
          <Stack spacing={2}>
            {relatedItems.map((relatedItem) => (
              <ArticleCard
                key={relatedItem.id}
                item={relatedItem}
                language={viewer.language}
                languageMode={viewer.contentLanguageMode}
                commentCount={0}
              />
            ))}
          </Stack>
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
