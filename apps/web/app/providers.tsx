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
import { store } from './lib/store';
import { buildTheme } from './theme/presets';

function ThemeBridge({ children }: PropsWithChildren) {
  const vibePreset = useSelector((state: RootState) => state.ui.vibePreset);
  const themeMode = useSelector((state: RootState) => state.ui.themeMode);
  const theme = buildTheme(vibePreset, themeMode);

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
