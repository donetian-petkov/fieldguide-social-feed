'use client';

import '@fontsource/cormorant-garamond';
import '@fontsource/fraunces';
import '@fontsource/ibm-plex-sans';
import '@fontsource/manrope';
import '@fontsource/sora';

import { PropsWithChildren } from 'react';
import { Provider, useSelector } from 'react-redux';
import { CssBaseline, ThemeProvider } from '@mui/material';

import type { RootState } from './lib/store';
import './lib/i18n';
import { useMeQuery } from './lib/api';
import { store } from './lib/store';
import { buildTheme } from './theme/presets';

function ThemeBridge({ children }: PropsWithChildren) {
  const meQuery = useMeQuery();
  const fallbackVibePreset = useSelector((state: RootState) => state.ui.vibePreset);
  const fallbackThemeMode = useSelector((state: RootState) => state.ui.themeMode);
  const fallbackFontScale = useSelector((state: RootState) => state.ui.fontScale);
  const user = meQuery.data?.user || null;
  const theme = buildTheme(user?.vibePreset || fallbackVibePreset, user?.themeMode || fallbackThemeMode, {
    fontFamily: user?.fontFamily,
    fontScale: user?.fontScale || fallbackFontScale
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export function Providers({ children }: PropsWithChildren) {
  return (
    <Provider store={store}>
      <ThemeBridge>{children}</ThemeBridge>
    </Provider>
  );
}
