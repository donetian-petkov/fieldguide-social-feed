'use client';

import { useState } from 'react';
import { Alert, Box, Button, Chip, Snackbar, Stack, Typography } from '@mui/material';

import type { ContentItem } from '@edu-feed/shared';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';
import {
  useAdminDashboardQuery,
  useDeleteAdminCommentMutation,
  useLockAdminItemCommentsMutation,
  usePatchAdminItemMutation,
  useRemoveAdminItemMutation,
  useReviewSubmissionMutation
} from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

export default function AdminModerationPage() {
  const fallback = getAdminModel();
  const { viewer } = useSessionViewer(fallback.viewer);
  const adminQuery = useAdminDashboardQuery();
  const model = adminQuery.data || {
    ...fallback,
    items: [],
    comments: []
  };
  const [toast, setToast] = useState<string | null>(null);
  const [reviewSubmission] = useReviewSubmissionMutation();
  const [deleteComment] = useDeleteAdminCommentMutation();
  const [patchItem] = usePatchAdminItemMutation();
  const [removeItem] = useRemoveAdminItemMutation();
  const [lockComments] = useLockAdminItemCommentsMutation();

  async function handleSubmission(submissionId: string, decision: 'approved' | 'rejected') {
    try {
      await reviewSubmission({ submissionId, decision }).unwrap();
      setToast(decision === 'approved' ? 'Submission approved.' : 'Submission rejected.');
    } catch {
      setToast('Could not review the submission.');
    }
  }

  async function handleCommentDelete(commentId: string) {
    try {
      await deleteComment({ commentId }).unwrap();
      setToast('Comment removed.');
    } catch {
      setToast('Could not remove the comment.');
    }
  }

  async function handleItemPatch(
    itemId: string,
    patch: Partial<Pick<ContentItem, 'audience' | 'commentsLocked' | 'flags' | 'hiddenByDefault' | 'pinned'>>,
    successMessage: string
  ) {
    try {
      await patchItem({ itemId, patch }).unwrap();
      setToast(successMessage);
    } catch {
      setToast('Could not update the item.');
    }
  }

  async function handleItemRemoval(itemId: string, removed: boolean) {
    try {
      await removeItem({ itemId, removed }).unwrap();
      setToast(removed ? 'Item removed from public feeds.' : 'Item restored.');
    } catch {
      setToast('Could not change the item visibility.');
    }
  }

  async function handleCommentLock(itemId: string, locked: boolean) {
    try {
      await lockComments({ itemId, locked }).unwrap();
      setToast(locked ? 'Comments locked.' : 'Comments unlocked.');
    } catch {
      setToast('Could not change comment locking.');
    }
  }

  return (
    <AppShell title="Admin Moderation" subtitle="Comment locks, article tags, removals, and the submission queue." viewer={viewer}>
      <Box sx={{ display: 'grid', gap: 3 }}>
        <SectionCard title="Submission Queue" eyebrow="Community approvals">
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
            {model.submissions.map((submission) => (
              <Box key={submission.id}>
                <SectionCard title={submission.title} eyebrow={submission.status}>
                  <Stack spacing={1.25}>
                    <Typography variant="body2">
                      Type: {submission.type}. Submitted by {submission.submittedBy}.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {submission.body || submission.sourceUrl}
                    </Typography>
                    <Stack direction="row" spacing={1.25}>
                      <Button variant="contained" size="small" onClick={() => void handleSubmission(submission.id, 'approved')}>
                        Approve
                      </Button>
                      <Button variant="outlined" size="small" color="inherit" onClick={() => void handleSubmission(submission.id, 'rejected')}>
                        Reject
                      </Button>
                    </Stack>
                  </Stack>
                </SectionCard>
              </Box>
            ))}
          </Box>
        </SectionCard>

        <SectionCard title="Recent Items" eyebrow="Flags, locks, and removals">
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
            {model.items.map((item) => (
              <Box key={item.id}>
                <SectionCard title={item.originalTitle} eyebrow={item.removedAt ? 'removed' : item.subject.replace('_', ' ')}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {item.tags.map((tag) => (
                        <Chip key={tag.id} size="small" label={tag.label} />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => void handleCommentLock(item.id, !item.commentsLocked)}
                      >
                        {item.commentsLocked ? 'Unlock Comments' : 'Lock Comments'}
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => void handleItemPatch(item.id, { flags: ['not_verified'] }, 'Item marked as not verified.')}
                      >
                        Mark Not Verified
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => void handleItemPatch(item.id, { flags: ['spoiler'] }, 'Item marked as spoiler.')}
                      >
                        Mark Spoiler
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        color={item.removedAt ? 'success' : 'error'}
                        onClick={() => void handleItemRemoval(item.id, !item.removedAt)}
                      >
                        {item.removedAt ? 'Restore' : 'Remove'}
                      </Button>
                    </Stack>
                  </Stack>
                </SectionCard>
              </Box>
            ))}
          </Box>
        </SectionCard>

        <SectionCard title="Recent Comments" eyebrow="Admin delete only">
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
            {model.comments.map((comment) => (
              <Box key={comment.id}>
                <SectionCard title={comment.authorDisplayName} eyebrow={comment.deletedAt ? 'deleted' : 'live'}>
                  <Stack spacing={1.25}>
                    <Typography variant="body2">{comment.body}</Typography>
                    {comment.moderationNote ? (
                      <Typography variant="caption" color="text.secondary">
                        {comment.moderationNote}
                      </Typography>
                    ) : null}
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      disabled={!!comment.deletedAt}
                      onClick={() => void handleCommentDelete(comment.id)}
                    >
                      Delete Comment
                    </Button>
                  </Stack>
                </SectionCard>
              </Box>
            ))}
          </Box>
        </SectionCard>
      </Box>
      {adminQuery.isError ? <Alert sx={{ mt: 3 }} severity="warning">Showing fallback moderation data because the admin API is unavailable.</Alert> : null}
      <Snackbar open={!!toast} autoHideDuration={2600} message={toast || ''} onClose={() => setToast(null)} />
    </AppShell>
  );
}
