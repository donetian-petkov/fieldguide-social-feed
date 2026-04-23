import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPreferenceWeights,
  isEligibleForMode,
  mergeSelectedCandidates,
  rankNewsletterCandidates,
  scoreItemFromPreferences
} from './newsletter-ranking.js';

test('rankNewsletterCandidates prefers saved and viewed subjects while excluding already seen items', () => {
  const ranked = rankNewsletterCandidates({
    candidates: [
      {
        id: 'candidate-history',
        subject: 'history',
        tags: [{ type: 'meta', value: 'museum' }],
        audience: 'kid_safe',
        publishedAt: new Date('2025-01-02T00:00:00.000Z')
      },
      {
        id: 'candidate-art',
        subject: 'art',
        tags: [{ type: 'meta', value: 'gallery' }],
        audience: 'kid_safe',
        publishedAt: new Date('2025-01-03T00:00:00.000Z')
      },
      {
        id: 'already-viewed',
        subject: 'history',
        tags: [{ type: 'meta', value: 'museum' }],
        audience: 'kid_safe',
        publishedAt: new Date('2025-01-04T00:00:00.000Z')
      }
    ],
    saved: [
      {
        id: 'saved-history',
        subject: 'history',
        tags: [{ type: 'meta', value: 'museum' }]
      }
    ],
    viewed: [
      {
        id: 'already-viewed',
        subject: 'history',
        tags: [{ type: 'meta', value: 'museum' }],
        viewCount: 2
      }
    ],
    hidden: [],
    deliveredIds: [],
    mode: 'standard'
  });

  assert.deepEqual(
    ranked.map((item) => item.id),
    ['candidate-history', 'candidate-art']
  );
});

test('kid mode removes adult-only and spoiler-tagged candidates', () => {
  assert.equal(
    isEligibleForMode(
      {
        id: 'kid-safe',
        subject: 'history',
        tags: [],
        audience: 'kid_safe',
        publishedAt: new Date('2025-01-01T00:00:00.000Z')
      },
      'kid'
    ),
    true
  );

  assert.equal(
    isEligibleForMode(
      {
        id: 'spoiler-item',
        subject: 'movies',
        tags: [{ type: 'flag', value: 'spoiler' }],
        audience: 'kid_safe',
        publishedAt: new Date('2025-01-01T00:00:00.000Z')
      },
      'kid'
    ),
    false
  );

  assert.equal(
    isEligibleForMode(
      {
        id: 'adult-only',
        subject: 'books',
        tags: [],
        audience: 'adult_only',
        publishedAt: new Date('2025-01-01T00:00:00.000Z')
      },
      'kid'
    ),
    false
  );
});

test('hidden signals reduce the preference score for matching subjects and tags', () => {
  const weights = buildPreferenceWeights({
    saved: [
      {
        id: 'saved-history',
        subject: 'history',
        tags: [{ type: 'meta', value: 'museum' }]
      }
    ],
    viewed: [],
    hidden: [
      {
        id: 'hidden-history',
        subject: 'history',
        tags: [{ type: 'meta', value: 'museum' }]
      }
    ]
  });

  const historyScore = scoreItemFromPreferences(weights, {
    subject: 'history',
    tags: [{ type: 'meta', value: 'museum' }]
  });
  const artScore = scoreItemFromPreferences(weights, {
    subject: 'art',
    tags: [{ type: 'meta', value: 'gallery' }]
  });

  assert.ok(historyScore > artScore);
  assert.equal(historyScore, 2);
});

test('mergeSelectedCandidates ignores invalid ids and backfills from heuristic order', () => {
  const merged = mergeSelectedCandidates({
    candidates: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    selectedIds: ['missing', 'b', 'b'],
    limit: 3
  });

  assert.deepEqual(merged.map((item) => item.id), ['b', 'a', 'c']);
});
