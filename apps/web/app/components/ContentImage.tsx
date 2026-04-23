'use client';

import { useState } from 'react';
import ImageNotSupportedRoundedIcon from '@mui/icons-material/ImageNotSupportedRounded';
import { Box, Stack, Typography } from '@mui/material';

type ResponsiveHeight = number | string | Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number | string>>;

export function ContentImage({
  src,
  alt,
  sourceIconUrl,
  sourceName,
  height,
  compact = false,
  sx
}: {
  src?: string | null;
  alt: string;
  sourceIconUrl?: string | null;
  sourceName?: string | null;
  height: ResponsiveHeight;
  compact?: boolean;
  sx?: Record<string, unknown>;
}) {
  const [failed, setFailed] = useState(!src);

  if (!src || failed) {
    return (
      <Box
        role="img"
        aria-label={`${alt} image unavailable`}
        sx={{
          width: '100%',
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(124, 82, 53, 0.08)',
          backgroundImage:
            'linear-gradient(135deg, rgba(124, 82, 53, 0.14), rgba(47, 82, 67, 0.10))',
          color: 'text.secondary',
          ...sx
        }}
      >
        <Stack spacing={compact ? 0.5 : 1} alignItems="center" sx={{ px: 2, textAlign: 'center' }}>
          {sourceIconUrl ? (
            <Box
              component="img"
              src={sourceIconUrl}
              alt=""
              aria-hidden="true"
              sx={{ width: compact ? 28 : 42, height: compact ? 28 : 42, borderRadius: 2, opacity: 0.8 }}
            />
          ) : (
            <ImageNotSupportedRoundedIcon fontSize={compact ? 'small' : 'large'} />
          )}
          <Typography variant={compact ? 'caption' : 'body2'}>
            Image unavailable
          </Typography>
          {!compact && sourceName ? (
            <Typography variant="caption" color="text.secondary">
              {sourceName}
            </Typography>
          ) : null}
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      sx={{
        width: '100%',
        height,
        objectFit: 'cover',
        display: 'block',
        ...sx
      }}
    />
  );
}
