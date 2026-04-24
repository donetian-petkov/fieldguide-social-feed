'use client';

import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';

import type { CommentDto, ContentItem } from '@edu-feed/shared';

import { AppShell } from '../../components/AppShell';
import { AskAiCard } from '../../components/AskAiCard';
import { ArticleCard } from '../../components/ArticleCard';
import { ContentImage } from '../../components/ContentImage';
import { SectionCard } from '../../components/SectionCard';
import { DEMO_FALLBACK_ENABLED, getItemModel, guestViewer } from '../../lib/demo';
import {
  useAddAlbumItemMutation,
  useAlbumsQuery,
  useCreateCommentMutation,
  useRuntimeHealthQuery,
  useItemQuery,
  useSaveItemMutation,
  useUnsaveItemMutation,
  useUpdateCommentMutation
} from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export default function ItemPage({ params }: { params: { slug: string } }) {
  const fallback = DEMO_FALLBACK_ENABLED ? getItemModel(params.slug) : null;
  const { viewer, isAuthenticated, savedIds } = useSessionViewer();
  const itemQuery = useItemQuery(params.slug);
  const healthQuery = useRuntimeHealthQuery();
  const albumsQuery = useAlbumsQuery(undefined, {
    skip: !isAuthenticated
  });
  const [createComment, createCommentState] = useCreateCommentMutation();
  const [updateComment, updateCommentState] = useUpdateCommentMutation();
  const [saveItem, saveItemState] = useSaveItemMutation();
  const [unsaveItem, unsaveItemState] = useUnsaveItemMutation();
  const [addAlbumItem, addAlbumItemState] = useAddAlbumItemMutation();
  const [commentBody, setCommentBody] = useState('');
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [savedState, setSavedState] = useState(false);
  const item = itemQuery.data?.item || fallback?.item || null;
  const comments = itemQuery.data?.comments || fallback?.comments || [];
  const relatedItems = fallback?.relatedItems || [];
  const translation = item ? item.translations.find((entry) => entry.language === viewer.language) || item.translations[0] : null;
  const albums = albumsQuery.data?.albums || [];
  const translatedArtifact = item?.translations.find((entry) => entry.aiAudit) || null;
  const aiAvailable = Boolean(healthQuery.data?.aiAvailable);
  const hasAiAudit =
    aiAvailable && viewer.role === 'admin' && Boolean(item?.ai.summaryAudit || item?.ai.classificationAudit || translatedArtifact?.aiAudit);
  const saveBusy = saveItemState.isLoading || unsaveItemState.isLoading;

  useEffect(() => {
    if (!selectedAlbumId && albums[0]?.id) {
      setSelectedAlbumId(albums[0].id);
    }
  }, [albums, selectedAlbumId]);

  useEffect(() => {
    setSavedState(Boolean(isAuthenticated && item && savedIds.includes(item.id)));
  }, [isAuthenticated, item, savedIds]);

  if (itemQuery.isLoading) {
    return (
      <AppShell title="Loading item" subtitle="Fetching the article from the API." viewer={viewer}>
        <Typography variant="body1">Loading article...</Typography>
      </AppShell>
    );
  }

  if (!item || !translation) {
    return (
      <AppShell title="Item not found" subtitle="The requested article or video could not be loaded." viewer={guestViewer}>
        <Typography variant="body1">Try another item from the main feed.</Typography>
      </AppShell>
    );
  }

  return (
    <AppShell title={translation.title || item.originalTitle} subtitle={item.sourceName} viewer={viewer}>
      <Stack spacing={3}>
        <ContentImage
          src={item.coverImageUrl}
          alt={translation.title || item.originalTitle}
          sourceIconUrl={item.sourceIconUrl}
          sourceName={item.sourceName}
          height={{ xs: 240, md: 380 }}
          sx={{ borderRadius: 4 }}
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
              <SectionCard title="Summary" eyebrow={aiAvailable ? 'AI translated and compressed' : 'Source summary'}>
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
                      <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
                        <Box>
                          <Typography variant="subtitle2">{comment.authorDisplayName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(comment.createdAt).toLocaleString()}
                            {comment.editedAt ? ' • edited' : ''}
                          </Typography>
                        </Box>
                        {canEditComment(comment, viewer.username, isAuthenticated) ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditingBody(comment.body);
                            }}
                          >
                            Edit
                          </Button>
                        ) : null}
                      </Stack>
                      {editingCommentId === comment.id ? (
                        <Stack spacing={1.25} sx={{ mt: 1 }}>
                          <TextField multiline minRows={3} value={editingBody} onChange={(event) => setEditingBody(event.target.value)} />
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={!editingBody.trim() || updateCommentState.isLoading}
                              onClick={async () => {
                                try {
                                  await updateComment({
                                    commentId: comment.id,
                                    body: editingBody.trim()
                                  }).unwrap();
                                  setEditingCommentId(null);
                                  setEditingBody('');
                                  setCommentMessage('Comment updated.');
                                } catch (error) {
                                  setCommentMessage(error instanceof Error ? error.message : 'Comment update failed.');
                                }
                              }}
                            >
                              {updateCommentState.isLoading ? 'Saving...' : 'Save edit'}
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingBody('');
                              }}
                            >
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          {comment.body}
                        </Typography>
                      )}
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
              {aiAvailable ? <AskAiCard item={item} language={viewer.language} /> : null}
              {hasAiAudit ? (
                <SectionCard title="AI audit" eyebrow="Stored artifact metadata">
                  <Stack spacing={1.5}>
                    {item.ai.summaryAudit ? <AiAuditRow label="Summary" audit={item.ai.summaryAudit} /> : null}
                    {translatedArtifact?.aiAudit ? (
                      <AiAuditRow label={`Translation (${translatedArtifact.language.toUpperCase()})`} audit={translatedArtifact.aiAudit} />
                    ) : null}
                    {item.ai.classificationAudit ? <AiAuditRow label="Classification" audit={item.ai.classificationAudit} /> : null}
                  </Stack>
                </SectionCard>
              ) : null}
              <SectionCard title="Save & albums" eyebrow="Personal library">
                <Stack spacing={1.5}>
                  {!isAuthenticated ? (
                    <Button component={Link} href="/auth" variant="contained">
                      Sign in to save item
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      disabled={saveBusy}
                      onClick={async () => {
                        try {
                          if (savedState) {
                            await unsaveItem(item.id).unwrap();
                            setSavedState(false);
                            setLibraryMessage('Removed from your library.');
                          } else {
                            await saveItem(item.id).unwrap();
                            setSavedState(true);
                            setLibraryMessage('Saved to your library.');
                          }
                        } catch (error) {
                          setLibraryMessage(
                            error instanceof Error
                              ? error.message
                              : savedState
                                ? 'Could not remove this item from your library.'
                                : 'Could not save this item.'
                          );
                        }
                      }}
                    >
                      {saveBusy ? 'Saving...' : savedState ? 'Saved item' : 'Save item'}
                    </Button>
                  )}
                  {isAuthenticated && albums.length ? (
                    <>
                      <FormControl fullWidth>
                        <InputLabel>Album</InputLabel>
                        <Select
                          label="Album"
                          value={selectedAlbumId}
                          onChange={(event) => setSelectedAlbumId(event.target.value)}
                        >
                          {albums.map((album) => (
                            <MenuItem key={album.id} value={album.id}>
                              {album.title}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button
                        variant="outlined"
                        disabled={!selectedAlbumId || addAlbumItemState.isLoading}
                        onClick={async () => {
                          try {
                            await addAlbumItem({ albumId: selectedAlbumId, itemId: item.id }).unwrap();
                            setLibraryMessage('Added to the selected album.');
                          } catch (error) {
                            setLibraryMessage(error instanceof Error ? error.message : 'Could not add the item to the album.');
                          }
                        }}
                      >
                        {addAlbumItemState.isLoading ? 'Adding...' : 'Add to album'}
                      </Button>
                    </>
                  ) : null}
                  {isAuthenticated && !albums.length ? (
                    <Typography variant="body2" color="text.secondary">
                      No albums yet. Create one in{' '}
                      <Box component={Link} href="/settings" sx={{ color: 'inherit', textDecoration: 'underline' }}>
                        Settings
                      </Box>
                      .
                    </Typography>
                  ) : null}
                  {!isAuthenticated ? (
                    <Typography variant="body2" color="text.secondary">
                      Sign in to save items and place them into albums.
                    </Typography>
                  ) : null}
                  {libraryMessage ? <Alert severity="info">{libraryMessage}</Alert> : null}
                </Stack>
              </SectionCard>
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
                isSaved={savedIds.includes(relatedItem.id)}
              />
            ))}
          </Stack>
        </SectionCard>
      </Stack>
    </AppShell>
  );
}

function AiAuditRow({
  label,
  audit
}: {
  label: string;
  audit: NonNullable<ContentItem['ai']['summaryAudit']>;
}) {
  return (
    <Box>
      <Typography variant="subtitle2">{label}</Typography>
      <Typography variant="body2" color="text.secondary">
        {audit.provider} / {audit.model}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {audit.inputTokens} in • {audit.outputTokens} out • ${audit.totalCostUsd.toFixed(4)} • {new Date(audit.createdAt).toLocaleString()}
      </Typography>
    </Box>
  );
}

function canEditComment(comment: CommentDto, username: string, isAuthenticated: boolean) {
  if (!isAuthenticated) return false;
  if (comment.authorUsername !== username) return false;
  if (comment.deletedAt) return false;
  return Date.now() - new Date(comment.createdAt).getTime() <= COMMENT_EDIT_WINDOW_MS;
}
