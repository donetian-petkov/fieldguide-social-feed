'use client';

import { configureStore } from '@reduxjs/toolkit';

import { fieldguideApi } from './api';
import { uiReducer } from './ui-slice';

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    [fieldguideApi.reducerPath]: fieldguideApi.reducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(fieldguideApi.middleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
