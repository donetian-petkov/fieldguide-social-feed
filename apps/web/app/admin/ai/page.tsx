import { Box, Typography } from '@mui/material';

import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { getAdminModel } from '../../lib/demo';

export default function AdminAiPage() {
  const model = getAdminModel();

  return (
    <AppShell title="Admin AI" subtitle="Provider, models, budgets, and usage tracking." viewer={model.viewer}>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))'
          }
        }}
      >
        <Box>
          <SectionCard title="Configuration" eyebrow={model.aiConfig.provider}>
            <Typography variant="body2">Summary model: {model.aiConfig.summaryModel}</Typography>
            <Typography variant="body2">Translation model: {model.aiConfig.translationModel}</Typography>
            <Typography variant="body2">Ask model: {model.aiConfig.askModel}</Typography>
            <Typography variant="body2">Monthly budget: ${model.aiConfig.monthlyBudgetUsd}</Typography>
            <Typography variant="body2">Per-job budget: ${model.aiConfig.perJobBudgetUsd}</Typography>
          </SectionCard>
        </Box>
        <Box>
          <SectionCard title="Recent usage" eyebrow="Ledger">
            {model.aiUsage.map((usage, index) => (
              <Typography variant="body2" key={`${usage.model}-${index}`}>
                {usage.purpose}: {usage.model} • ${usage.totalCostUsd}
              </Typography>
            ))}
          </SectionCard>
        </Box>
      </Box>
    </AppShell>
  );
}
