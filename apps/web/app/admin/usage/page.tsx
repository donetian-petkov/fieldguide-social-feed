'use client';

import { Alert, Box, Chip, Stack, Typography } from '@mui/material';

import { AdminSectionNav } from '../../components/AdminSectionNav';
import { AppShell } from '../../components/AppShell';
import { SectionCard } from '../../components/SectionCard';
import { useAdminUsageBreakdownQuery } from '../../lib/api';
import { useSessionViewer } from '../../lib/session';

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

function formatUsd(value: number) {
  return `$${value.toFixed(value >= 10 ? 0 : 2)}`;
}

function UsageStat({
  label,
  value,
  supporting
}: {
  label: string;
  value: string;
  supporting?: string;
}) {
  return (
    <SectionCard title={value} eyebrow={label}>
      {supporting ? (
        <Typography variant="body2" color="text.secondary">
          {supporting}
        </Typography>
      ) : null}
    </SectionCard>
  );
}

function DailyTokenChart({
  days
}: {
  days: Array<{ date: string; label: string; inputTokens: number; outputTokens: number; totalCostUsd: number }>;
}) {
  const maxTotal = Math.max(1, ...days.map((day) => day.inputTokens + day.outputTokens));

  return (
    <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ minHeight: 240, overflowX: 'auto', pb: 1 }}>
      {days.map((day) => {
        const inputHeight = (day.inputTokens / maxTotal) * 180;
        const outputHeight = (day.outputTokens / maxTotal) * 180;
        return (
          <Stack key={day.date} spacing={1} sx={{ minWidth: 44, flex: 1, maxWidth: 72 }} alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {formatCompactNumber(day.inputTokens + day.outputTokens)}
            </Typography>
            <Box
              title={`${day.date}: ${formatCompactNumber(day.inputTokens)} in, ${formatCompactNumber(day.outputTokens)} out, ${formatUsd(day.totalCostUsd)}`}
              sx={{
                width: '100%',
                height: 180,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'action.hover',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                overflow: 'hidden'
              }}
            >
              <Box sx={{ height: Math.max(outputHeight, day.outputTokens > 0 ? 4 : 0), backgroundColor: 'secondary.main' }} />
              <Box sx={{ height: Math.max(inputHeight, day.inputTokens > 0 ? 4 : 0), backgroundColor: 'primary.main' }} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {day.label}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

function HorizontalUsageBars({
  items,
  valueKey,
  renderValue
}: {
  items: Array<{ label: string; inputTokens: number; outputTokens: number; totalCostUsd: number }>;
  valueKey: 'inputTokens' | 'outputTokens' | 'totalCostUsd';
  renderValue: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...items.map((item) => item[valueKey]));

  return (
    <Stack spacing={1.5}>
      {items.map((item) => (
        <Stack key={item.label} spacing={0.75}>
          <Stack direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="body2">{item.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              {renderValue(item[valueKey])}
            </Typography>
          </Stack>
          <Box
            sx={{
              height: 12,
              borderRadius: 999,
              backgroundColor: 'action.hover',
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Box
              sx={{
                width: `${(item[valueKey] / maxValue) * 100}%`,
                minWidth: item[valueKey] > 0 ? 10 : 0,
                height: '100%',
                borderRadius: 999,
                backgroundColor: 'primary.main'
              }}
            />
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

export default function AdminUsagePage() {
  const { viewer } = useSessionViewer();
  const breakdownQuery = useAdminUsageBreakdownQuery();
  const breakdown = breakdownQuery.data?.breakdown;

  return (
    <AppShell title="Admin Usage" subtitle="Token and cost breakdown for AI activity." viewer={viewer}>
      <Stack spacing={3}>
        <AdminSectionNav />
        {breakdown ? (
          <>
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'repeat(4, minmax(0, 1fr))'
                }
              }}
            >
              <UsageStat
                label="Estimated monthly cost"
                value={formatUsd(breakdown.totals.totalCostUsd)}
                supporting="Calculated from the built-in model pricing table."
              />
              <UsageStat
                label="Recorded monthly cost"
                value={formatUsd(breakdown.totals.recordedCostUsd)}
                supporting="What was stored on each ledger row when the job ran."
              />
              <UsageStat
                label="Pricing confidence"
                value={breakdown.totals.pricingConfidence}
                supporting={
                  breakdown.totals.fallbackModels.length
                    ? `Fallback pricing was used for: ${breakdown.totals.fallbackModels.join(', ')}`
                    : 'Every model matched a known pricing entry.'
                }
              />
              <UsageStat
                label="Pricing table"
                value={breakdown.totals.pricingTableVersion}
                supporting="Static table derived from provider pricing pages, not invoice APIs."
              />
            </Box>

            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: {
                  xs: '1fr',
                  lg: 'minmax(0, 1.3fr) minmax(0, 0.9fr)'
                }
              }}
            >
              <SectionCard title="Daily token volume" eyebrow="Monthly activity">
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Input tokens are shown in the darker bar segment. Output tokens are shown in the accent segment.
                </Typography>
                <DailyTokenChart days={breakdown.byDay} />
              </SectionCard>

              <SectionCard title="Purpose cost breakdown" eyebrow="Estimated spend by purpose">
                <HorizontalUsageBars
                  items={breakdown.byPurpose}
                  valueKey="totalCostUsd"
                  renderValue={formatUsd}
                />
              </SectionCard>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: {
                  xs: '1fr',
                  lg: 'repeat(2, minmax(0, 1fr))'
                }
              }}
            >
              <SectionCard title="Purpose input tokens" eyebrow="Volume by purpose">
                <HorizontalUsageBars
                  items={breakdown.byPurpose}
                  valueKey="inputTokens"
                  renderValue={formatCompactNumber}
                />
              </SectionCard>

              <SectionCard title="Model mix" eyebrow="How pricing was resolved">
                <Stack spacing={1.5}>
                  {breakdown.byModel.map((entry) => (
                    <Box
                      key={entry.model}
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        backgroundColor: 'action.hover'
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                        <Typography variant="body1">{entry.model}</Typography>
                        <Chip
                          size="small"
                          color={entry.exactModelMatch ? 'success' : 'warning'}
                          label={entry.exactModelMatch ? 'Exact price match' : `Priced as ${entry.pricedAsModel}`}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        {formatCompactNumber(entry.inputTokens)} in • {formatCompactNumber(entry.outputTokens)} out • {formatUsd(entry.totalCostUsd)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </SectionCard>
            </Box>
          </>
        ) : null}

        {breakdownQuery.isLoading ? (
          <Alert severity="info">Loading monthly usage breakdown…</Alert>
        ) : null}
        {breakdownQuery.isError ? (
          <Alert severity="warning">Usage charts are available only after signing in as an admin and connecting to the API.</Alert>
        ) : null}
      </Stack>
    </AppShell>
  );
}
