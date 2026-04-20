import { createTheme } from '@mui/material/styles';

import type { ThemeMode, VibePreset } from '@edu-feed/shared';

const presetPalette = {
  museum: {
    light: { primary: '#7a4128', secondary: '#d3b289', background: '#f4ede2', paper: '#fffaf2', text: '#2a1c15' },
    dark: { primary: '#dfab72', secondary: '#9fd0c7', background: '#17120f', paper: '#211815', text: '#f8efe6' }
  },
  archive: {
    light: { primary: '#233241', secondary: '#7fa7b8', background: '#eef1f3', paper: '#f9fbfc', text: '#14212b' },
    dark: { primary: '#90abc0', secondary: '#d7c8a0', background: '#0e171d', paper: '#16232c', text: '#eff6fb' }
  },
  field_notes: {
    light: { primary: '#3a6a4b', secondary: '#c3a960', background: '#f0f4ef', paper: '#fbfdf9', text: '#1f2d24' },
    dark: { primary: '#96c59f', secondary: '#e0c382', background: '#101812', paper: '#18241b', text: '#edf5ee' }
  },
  cinema: {
    light: { primary: '#7e2230', secondary: '#e2aa61', background: '#f5ece8', paper: '#fff8f4', text: '#2d1418' },
    dark: { primary: '#ff8da0', secondary: '#f4c97b', background: '#140d10', paper: '#201418', text: '#f9edf0' }
  },
  naturalist: {
    light: { primary: '#42644a', secondary: '#8a7248', background: '#f2f0e8', paper: '#fdfcf8', text: '#243127' },
    dark: { primary: '#acd0b0', secondary: '#d4bc93', background: '#11140f', paper: '#1a1f18', text: '#f2f4ef' }
  }
} as const;

const fontByPreset: Record<VibePreset, string> = {
  museum: '"Fraunces", "Georgia", serif',
  archive: '"IBM Plex Sans", "Helvetica Neue", sans-serif',
  field_notes: '"Manrope", "Helvetica Neue", sans-serif',
  cinema: '"Sora", "Helvetica Neue", sans-serif',
  naturalist: '"Cormorant Garamond", "Georgia", serif'
};

export function buildTheme(vibePreset: VibePreset, themeMode: ThemeMode) {
  const effectiveMode = themeMode === 'system' ? 'light' : themeMode;
  const palette = presetPalette[vibePreset][effectiveMode];
  const fontFamily = fontByPreset[vibePreset];

  return createTheme({
    palette: {
      mode: effectiveMode,
      primary: { main: palette.primary },
      secondary: { main: palette.secondary },
      background: {
        default: palette.background,
        paper: palette.paper
      },
      text: {
        primary: palette.text
      }
    },
    shape: {
      borderRadius: 18
    },
    typography: {
      fontFamily,
      h1: { fontFamily, fontWeight: 700 },
      h2: { fontFamily, fontWeight: 700 },
      h3: { fontFamily, fontWeight: 700 },
      h4: { fontFamily, fontWeight: 700 },
      button: {
        fontWeight: 700,
        textTransform: 'none'
      }
    }
  });
}
