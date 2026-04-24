import test from 'node:test';
import assert from 'node:assert/strict';

import { toJobId } from './job-ids.js';

test('toJobId strips colon separators and unsafe characters', () => {
  assert.equal(toJobId('source:start', 'src-history:world'), 'source-start-src-history-world');
});

test('toJobId preserves bullmq-safe characters', () => {
  assert.equal(toJobId('newsletter', 'alex_user', 'weekly'), 'newsletter-alex_user-weekly');
});
