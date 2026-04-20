import { Box, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';

export default function AdminSourcesPage() {
  const model = getAdminModel();

  return (
    <AppShell title="Admin Sources" subtitle="Add, edit, pause, resume, and inspect predefined feeds." viewer={model.viewer}>
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
        {model.sources.map((source) => (
          <Box key={source.id}>
            <SectionCard title={source.name} eyebrow={source.status}>
              <Typography variant="body2">{source.description}</Typography>
              <Typography variant="caption" color="text.secondary">
                {source.kind} • {source.language} • {source.sourceType}
              </Typography>
            </SectionCard>
          </Box>
        ))}
      </Box>
    </AppShell>
  );
}
