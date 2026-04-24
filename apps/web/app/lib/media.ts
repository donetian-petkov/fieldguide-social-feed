const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function toMediaProxyUrl(src?: string | null) {
  if (!src) {
    return null;
  }

  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }

  try {
    const sourceUrl = new URL(src);
    if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
      return src;
    }

    const relayUrl = new URL('/v1/media', apiBaseUrl);
    if (sourceUrl.origin === relayUrl.origin && sourceUrl.pathname === relayUrl.pathname) {
      return src;
    }

    relayUrl.searchParams.set('url', sourceUrl.toString());
    return relayUrl.toString();
  } catch {
    return src;
  }
}
