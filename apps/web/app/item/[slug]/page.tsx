import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { AskAiCard } from '../../components/AskAiCard';
import { ArticleCard } from '../../components/ArticleCard';
import { SectionCard } from '../../components/SectionCard';
import { getItemModel, demoViewer } from '../../lib/demo';

export default function ItemPage({ params }: { params: { slug: string } }) {
  const model = getItemModel(params.slug);
  if (!model) {
    return (
      <AppShell title="Item not found" subtitle="The requested article or video does not exist in the demo dataset." viewer={demoViewer}>
        <Typography variant="body1">Try another item from the main feed.</Typography>
      </AppShell>
    );
  }

  return (
    <AppShell title={model.translation?.title || model.item.originalTitle} subtitle={model.item.sourceName} viewer={demoViewer}>
      <Stack spacing={3}>
        <Box
          component="img"
          src={model.item.coverImageUrl}
          alt={model.translation?.title || model.item.originalTitle}
          sx={{ width: '100%', height: { xs: 240, md: 380 }, objectFit: 'cover', borderRadius: 4 }}
        />

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {model.item.tags.map((tag) => (
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
                <Typography variant="body1">{model.translation?.summary}</Typography>
                {model.item.bodyMarkdown ? (
                  <Typography variant="body2" color="text.secondary">
                    {model.item.bodyMarkdown}
                  </Typography>
                ) : null}
              </SectionCard>

              <SectionCard title="Comments" eyebrow="Flat thread">
                <Stack id="comments" spacing={2}>
                  {model.comments.map((comment) => (
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
                </Stack>
              </SectionCard>
            </Stack>
          </Box>

          <Box>
            <Stack spacing={3}>
              <AskAiCard item={model.item} language={demoViewer.language} />
              <SectionCard title="Original source" eyebrow="Outbound">
                <Button
                  component="a"
                  href={model.item.externalUrl || '#'}
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
            {model.relatedItems.map((item) => (
              <ArticleCard
                key={item.id}
                item={item}
                language={demoViewer.language}
                languageMode={demoViewer.contentLanguageMode}
                commentCount={0}
              />
            ))}
          </Stack>
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
