'use client';

import { useEffect, useMemo, useState } from 'react';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import { Box } from '@mui/material';

import { toMediaProxyUrl } from '../lib/media';

export function SourceMark({
  src,
  label,
  size = 28,
  borderRadius = 2
}: {
  src?: string | null;
  label?: string | null;
  size?: number;
  borderRadius?: number;
}) {
  const proxiedSrc = useMemo(() => toMediaProxyUrl(src), [src]);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(proxiedSrc ? 'loading' : 'error');
  const initial = useMemo(() => label?.trim().charAt(0).toUpperCase() || null, [label]);

  useEffect(() => {
    setStatus(proxiedSrc ? 'loading' : 'error');
  }, [proxiedSrc]);

  return (
    <Box sx={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      {status !== 'loaded' ? (
        <Box
          aria-hidden="true"
          sx={{
            width: size,
            height: size,
            borderRadius,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(124, 82, 53, 0.12)',
            color: 'text.secondary',
            fontSize: Math.max(12, Math.round(size * 0.45)),
            fontWeight: 700,
            lineHeight: 1
          }}
        >
          {initial || <PublicRoundedIcon sx={{ fontSize: Math.max(16, Math.round(size * 0.55)) }} />}
        </Box>
      ) : null}
      {proxiedSrc ? (
        <Box
          component="img"
          src={proxiedSrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          sx={{
            position: 'absolute',
            inset: 0,
            width: size,
            height: size,
            borderRadius,
            opacity: status === 'loaded' ? 1 : 0,
            transition: 'opacity 160ms ease',
            pointerEvents: 'none'
          }}
        />
      ) : null}
    </Box>
  );
}
