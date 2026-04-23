import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMO_ITEMS,
  DEMO_SOURCES,
  DEMO_USERS,
  contentItemSchema,
  sourceDefinitionSchema,
  subjectTagSchema,
  userSettingsDtoSchema
} from './index.js';

test('demo registry entries conform to shared schemas', () => {
  DEMO_SOURCES.forEach((source) => sourceDefinitionSchema.parse(source));
  DEMO_ITEMS.forEach((item) => contentItemSchema.parse(item));
  DEMO_USERS.forEach((user) => userSettingsDtoSchema.parse(user));
});

test('launch source registry covers every planned subject feed', () => {
  const subjects = new Set(DEMO_SOURCES.flatMap((source) => source.subjects));
  const requiredSubjects = subjectTagSchema.options.filter((subject) => subject !== 'community');

  requiredSubjects.forEach((subject) => {
    assert.equal(subjects.has(subject), true, `missing seeded source coverage for subject ${subject}`);
  });
});

test('Geography Now is wired to the official YouTube RSS feed', () => {
  const source = DEMO_SOURCES.find((entry) => entry.slug === 'geography-now');

  assert.ok(source);
  assert.equal(source.kind, 'youtube');
  assert.equal(source.status, 'active');
  assert.match(source.feedUrl, /youtube\.com\/feeds\/videos\.xml\?channel_id=UCmmPgObSUPw1HL2l6H4ffA/);
});

test('seeded source definitions keep ids and slugs unique', () => {
  const ids = new Set<string>();
  const slugs = new Set<string>();

  DEMO_SOURCES.forEach((source) => {
    assert.equal(ids.has(source.id), false, `duplicate source id ${source.id}`);
    assert.equal(slugs.has(source.slug), false, `duplicate source slug ${source.slug}`);
    ids.add(source.id);
    slugs.add(source.slug);
  });
});
