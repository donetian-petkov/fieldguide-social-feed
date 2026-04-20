'use client';

import { PropsWithChildren } from 'react';
import { Card, CardContent, Stack, Typography } from '@mui/material';

export function SectionCard({
  title,
  eyebrow,
  children
}: PropsWithChildren<{ title: string; eyebrow?: string }>) {
  return (
    <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Stack spacing={1.5}>
          {eyebrow ? (
            <Typography variant="overline" color="text.secondary">
              {eyebrow}
            </Typography>
          ) : null}
          <Typography variant="h5">{title}</Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}
