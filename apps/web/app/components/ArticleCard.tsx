'use client';

import Link from 'next/link';
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Typography
} from '@mui/material';

import type { ContentItem, ContentLanguageMode, InterfaceLanguage } from '@edu-feed/shared';
import { resolveTranslation } from '@edu-feed/shared';

import { useHealthQuery, useHideItemMutation, useSaveItemMutation, useShareItemMutation, useUnsaveItemMutation } from '../lib/api';
import { useSessionViewer } from '../lib/session';
import { AskAiCard } from './AskAiCard';
import { ContentImage } from './ContentImage';
import { SourceMark } from './SourceMark';

export function ArticleCard({
  item,
  language,
  languageMode,
  commentCount,
  showImage = true,
  isSaved = false,
  onHide,
  onSavedChange
}: {
  item: ContentItem;
  language: InterfaceLanguage;
  languageMode: ContentLanguageMode;
  commentCount: number;
  showImage?: boolean;
  isSaved?: boolean;
  onHide?: (itemId: string) => void;
  onSavedChange?: (itemId: string, nextSaved: boolean) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedState, setSavedState] = useState(isSaved);
  const { isAuthenticated, viewer } = useSessionViewer();
  const healthQuery = useHealthQuery();
  const [saveItem, saveItemState] = useSaveItemMutation();
  const [unsaveItem, unsaveItemState] = useUnsaveItemMutation();
  const [hideItem] = useHideItemMutation();
  const [shareItem] = useShareItemMutation();
  const translation = resolveTranslation(item, language) || item.translations[0];
  const english = resolveTranslation(item, 'en');
  const bulgarian = resolveTranslation(item, 'bg');
  const detailHref = `/item/${item.slug}`;
  const aiAvailable = Boolean(healthQuery.data?.aiAvailable);
  const saveBusy = saveItemState.isLoading || unsaveItemState.isLoading;

  useEffect(() => {
    setSavedState(isSaved);
  }, [isSaved]);

  const navigateToDetail = () => {
    router.push(detailHref);
  };

  const handleCardActivate = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"]')) {
      return;
    }
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    if ('preventDefault' in event) {
      event.preventDefault();
    }
    navigateToDetail();
  };

  return (
    <>
      <Card
        sx={{ overflow: 'hidden', border: '1px solid', borderColor: 'divider', cursor: 'pointer' }}
        role="link"
        tabIndex={0}
        onClick={handleCardActivate}
        onKeyDown={handleCardActivate}
      >
        {showImage ? (
          <ContentImage
            src={item.coverImageUrl}
            alt={translation?.title || item.originalTitle}
            sourceIconUrl={item.sourceIconUrl}
            sourceName={item.sourceName}
            height={240}
          />
        ) : null}
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <SourceMark src={item.sourceIconUrl} label={item.sourceName} size={28} borderRadius={2} />
                  <Typography variant="subtitle2" color="text.secondary">
                    {item.sourceName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(item.publishedAt).toLocaleDateString()}
                  </Typography>
                </Stack>
                <Typography
                  component={Link}
                  href={detailHref}
                  variant="h5"
                  sx={{
                    color: 'text.primary',
                    textDecoration: 'none',
                    '&:hover': {
                      color: 'primary.main',
                      textDecoration: 'underline'
                    }
                  }}
                >
                  {translation?.title || item.originalTitle}
                </Typography>
              </Stack>
              <IconButton
                aria-label="Hide item"
                onClick={async () => {
                  if (isAuthenticated) {
                    await hideItem(item.id).unwrap().catch(() => undefined);
                  }
                  onHide?.(item.id);
                  setToast('Article hidden from your current feed.');
                }}
              >
                <CloseRoundedIcon />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {item.tags.map((tag) => (
                <Chip key={tag.id} label={tag.label} size="small" color={tag.type === 'flag' ? 'secondary' : 'default'} />
              ))}
            </Stack>

            {languageMode === 'dual' ? (
              <Stack spacing={1}>
                <Typography variant="body1">{expanded ? english?.summary : truncateSummary(english?.summary || item.originalSummary)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {expanded ? bulgarian?.summary : truncateSummary(bulgarian?.summary || item.originalSummary)}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body1">
                {expanded ? translation?.summary : truncateSummary(translation?.summary || item.originalSummary)}
              </Typography>
            )}

            <Button onClick={() => setExpanded((value) => !value)} sx={{ alignSelf: 'flex-start', px: 0 }}>
              {expanded ? 'View Less' : 'View More'}
            </Button>

            <Divider />

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button component={Link} href={detailHref} startIcon={<OpenInNewRoundedIcon />} variant="contained">
                Open story
              </Button>
              {!isAuthenticated ? (
                <Button component={Link} href="/auth" startIcon={<BookmarkBorderRoundedIcon />} variant="outlined">
                  Sign in to save
                </Button>
              ) : (
                <Button
                  startIcon={savedState ? <BookmarkRoundedIcon /> : <BookmarkBorderRoundedIcon />}
                  variant={savedState ? 'contained' : 'outlined'}
                  disabled={saveBusy}
                  onClick={async () => {
                    try {
                      if (savedState) {
                        await unsaveItem(item.id).unwrap();
                        setSavedState(false);
                        onSavedChange?.(item.id, false);
                        setToast('Removed from your library.');
                      } else {
                        await saveItem(item.id).unwrap();
                        setSavedState(true);
                        onSavedChange?.(item.id, true);
                        setToast('Saved to your library.');
                      }
                    } catch {
                      setToast(savedState ? 'Could not remove this item from your library.' : 'Could not save this item.');
                    }
                  }}
                >
                  {saveBusy ? 'Saving...' : savedState ? 'Saved' : 'Save'}
                </Button>
              )}
              <Button
                startIcon={<IosShareRoundedIcon />}
                variant="outlined"
                onClick={async () => {
                  try {
                    const result = await shareItem(item.id).unwrap();
                    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(result.shareUrl);
                    }
                    setToast('Share link copied.');
                  } catch {
                    setToast('Share action failed.');
                  }
                }}
              >
                Share
              </Button>
              <Button component={Link} href={`/item/${item.slug}#comments`} startIcon={<ChatBubbleOutlineRoundedIcon />} variant="outlined">
                Comment ({commentCount})
              </Button>
              {aiAvailable ? (
                <Button
                  startIcon={<SmartToyOutlinedIcon />}
                  variant="contained"
                  onClick={() => {
                    if (isAuthenticated && !viewer.askAiEnabled) {
                      setToast('Ask-AI is disabled in your settings.');
                      return;
                    }
                    setAskOpen((value) => !value);
                  }}
                  data-ask-ai-toggle="true"
                  disabled={isAuthenticated && !viewer.askAiEnabled}
                >
                  Ask AI
                </Button>
              ) : null}
            </Stack>

            <Collapse in={askOpen && aiAvailable}>
              <AskAiCard item={item} language={language} />
            </Collapse>
          </Stack>
        </CardContent>
      </Card>

      <Snackbar open={!!toast} autoHideDuration={2600} onClose={() => setToast(null)} message={toast || ''} />
    </>
  );
}

function truncateSummary(summary: string) {
  if (summary.length <= 180) return summary;
  return `${summary.slice(0, 177)}...`;
}
