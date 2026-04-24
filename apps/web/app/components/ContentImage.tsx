'use client';

import { useEffect, useState } from 'react';
import ImageNotSupportedRoundedIcon from '@mui/icons-material/ImageNotSupportedRounded';
import { Box, Stack, Typography } from '@mui/material';

import { toMediaProxyUrl } from '../lib/media';
import { SourceMark } from './SourceMark';

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
  const proxiedSrc = toMediaProxyUrl(src);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(proxiedSrc ? 'loading' : 'error');

  useEffect(() => {
    setStatus(proxiedSrc ? 'loading' : 'error');
  }, [proxiedSrc]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height,
        overflow: 'hidden',
        ...sx
      }}
    >
      {status !== 'loaded' ? (
        <Box
          role="img"
          aria-label={`${alt} image unavailable`}
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(124, 82, 53, 0.08)',
            backgroundImage:
              'linear-gradient(135deg, rgba(124, 82, 53, 0.14), rgba(47, 82, 67, 0.10))',
            color: 'text.secondary'
          }}
        >
          <Stack spacing={compact ? 0.5 : 1} alignItems="center" sx={{ px: 2, textAlign: 'center' }}>
            {sourceIconUrl || sourceName ? (
              <SourceMark src={sourceIconUrl} label={sourceName} size={compact ? 28 : 42} borderRadius={2} />
            ) : (
              <ImageNotSupportedRoundedIcon fontSize={compact ? 'small' : 'large'} />
            )}
            <Typography variant={compact ? 'caption' : 'body2'}>Image unavailable</Typography>
            {!compact && sourceName ? (
              <Typography variant="caption" color="text.secondary">
                {sourceName}
              </Typography>
            ) : null}
          </Stack>
        </Box>
      ) : null}
      {proxiedSrc ? (
        <Box
          component="img"
          src={proxiedSrc}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: status === 'loaded' ? 'block' : 'none'
          }}
        />
      ) : null}
    </Box>
  );
}
