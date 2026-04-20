'use client';

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ContentMode, ContentLanguageMode, InterfaceLanguage, ThemeMode, VibePreset } from '@edu-feed/shared';

type UiState = {
  language: InterfaceLanguage;
  contentLanguageMode: ContentLanguageMode;
  themeMode: ThemeMode;
  vibePreset: VibePreset;
  fontScale: 'sm' | 'md' | 'lg';
  imageMode: 'on' | 'off';
  contentMode: ContentMode;
};

const initialState: UiState = {
  language: 'en',
  contentLanguageMode: 'single',
  themeMode: 'light',
  vibePreset: 'museum',
  fontScale: 'md',
  imageMode: 'on',
  contentMode: 'standard'
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setLanguage(state, action: PayloadAction<InterfaceLanguage>) {
      state.language = action.payload;
    },
    setContentLanguageMode(state, action: PayloadAction<ContentLanguageMode>) {
      state.contentLanguageMode = action.payload;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    setVibePreset(state, action: PayloadAction<VibePreset>) {
      state.vibePreset = action.payload;
    },
    setFontScale(state, action: PayloadAction<'sm' | 'md' | 'lg'>) {
      state.fontScale = action.payload;
    },
    setImageMode(state, action: PayloadAction<'on' | 'off'>) {
      state.imageMode = action.payload;
    },
    setContentMode(state, action: PayloadAction<ContentMode>) {
      state.contentMode = action.payload;
    }
  }
});

export const {
  setContentLanguageMode,
  setContentMode,
  setFontScale,
  setImageMode,
  setLanguage,
  setThemeMode,
  setVibePreset
} = uiSlice.actions;

export const uiReducer = uiSlice.reducer;
