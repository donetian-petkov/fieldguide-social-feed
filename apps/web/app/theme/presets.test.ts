import test from 'node:test';
import assert from 'node:assert/strict';

import type { VibePreset } from '@edu-feed/shared';

import { buildTheme } from './presets.js';

const presets: VibePreset[] = ['museum', 'archive', 'field_notes', 'cinema', 'naturalist'];

test('every vibe preset builds a light and dark theme', () => {
  presets.forEach((preset) => {
    const light = buildTheme(preset, 'light');
    const dark = buildTheme(preset, 'dark');

    assert.equal(light.palette.mode, 'light');
    assert.equal(dark.palette.mode, 'dark');
    assert.ok(light.typography.fontFamily.length > 0);
    assert.ok(dark.typography.fontFamily.length > 0);
  });
});

test('system theme mode falls back to light for SSR-safe rendering', () => {
  const theme = buildTheme('museum', 'system');

  assert.equal(theme.palette.mode, 'light');
});

test('font overrides from settings are applied to generated themes', () => {
  const theme = buildTheme('archive', 'dark', {
    fontFamily: '"Test Sans", sans-serif',
    fontScale: 'lg'
  });

  assert.equal(theme.typography.fontFamily, '"Test Sans", sans-serif');
  assert.equal(theme.typography.fontSize, 16);
  assert.equal(theme.typography.h1?.fontFamily, '"Test Sans", sans-serif');
});
