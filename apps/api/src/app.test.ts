import test from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_SOURCES } from '@edu-feed/shared';

import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import { DemoStore } from './lib/demo-store.js';
import type { AppQueues } from './lib/queues.js';

class TrackingStore extends DemoStore {
  public recordedViews: Array<{ username: string; itemId: string }> = [];

  override recordItemView(username: string, itemId: string) {
    this.recordedViews.push({ username, itemId });
    return super.recordItemView(username, itemId);
  }
}

class TrackingQueues implements AppQueues {
  public scheduledSources: Array<{ sourceId: string; feedUrl: string; pollIntervalSec?: number }> = [];

  public syncedNewsletters: Array<{ username: string; enabled: boolean; mode?: 'weekly' | 'daily' }> = [];

  public generatedDrafts: string[] = [];

  async scheduleSource(sourceId: string, feedUrl: string, pollIntervalSec?: number) {
    this.scheduledSources.push({ sourceId, feedUrl, pollIntervalSec });
  }

  async runSourceResync() {}

  async removeSourceSchedule() {}

  async generateStoryDraft(draftId: string) {
    this.generatedDrafts.push(draftId);
  }

  async scheduleNewsletter() {}

  async syncNewsletterSchedule(username: string, enabled: boolean, mode?: 'weekly' | 'daily') {
    this.syncedNewsletters.push({ username, enabled, mode });
  }

  async close() {}
}

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 4000,
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'mysql://fieldguide:fieldguide@127.0.0.1:3306/fieldguide',
  REDIS_URL: 'redis://127.0.0.1:6379',
  COOKIE_SECRET: 'replace-with-a-long-random-string',
  SESSION_TTL_HOURS: 168,
  MODE_SWITCH_TTL_MINUTES: 10,
  DEMO_MODE: true,
  DEFAULT_AI_PROVIDER: 'openai',
  SUMMARY_MODEL: 'gpt-4.1-mini',
  TRANSLATION_MODEL: 'gpt-4.1-mini',
  ASK_MODEL: 'gpt-4.1-mini',
  NEWSLETTER_MODEL: 'gpt-4.1-mini',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  OPENROUTER_API_KEY: '',
  ENABLE_EMAIL: false
};

function createHarness() {
  const store = new TrackingStore({
    sessionTtlHours: testConfig.SESSION_TTL_HOURS,
    modeSwitchTtlMinutes: testConfig.MODE_SWITCH_TTL_MINUTES,
    appUrl: testConfig.APP_URL
  });
  const queues = new TrackingQueues();
  return { store, queues };
}

function readCookie(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const header = response.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  assert.ok(first, 'expected set-cookie header');
  if (typeof first !== 'string') {
    throw new Error('Expected set-cookie header to be a string.');
  }
  return first.split(';')[0];
}

async function login(app: Awaited<ReturnType<typeof buildApp>>, username: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { username, password }
  });

  assert.equal(response.statusCode, 200);
  return readCookie(response);
}

test('register creates a session cookie and exposes the new user through /v1/me', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        username: 'iris',
        displayName: 'Iris Vale',
        password: 'fieldguide123'
      }
    });

    assert.equal(registerResponse.statusCode, 200);
    const cookie = readCookie(registerResponse);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: {
        cookie
      }
    });

    assert.equal(meResponse.statusCode, 200);
    const body = meResponse.json();
    assert.equal(body.user.username, 'iris');
    assert.equal(body.user.displayName, 'Iris Vale');
  } finally {
    await app.close();
  }
});

test('item detail records a view for the signed-in user', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const cookie = await login(app, 'alex', 'fieldguide123');
    const response = await app.inject({
      method: 'GET',
      url: '/v1/items/item-sutton-hoo',
      headers: {
        cookie
      }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(store.recordedViews.at(-1), {
      username: 'alex',
      itemId: 'item-sutton-hoo'
    });
  } finally {
    await app.close();
  }
});

test('feed pagination returns a stable page slice and metadata', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const firstPage = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=history&page=1&pageSize=1'
    });
    const secondPage = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=history&page=2&pageSize=1'
    });

    assert.equal(firstPage.statusCode, 200);
    assert.equal(secondPage.statusCode, 200);
    assert.equal(firstPage.json().items.length, 1);
    assert.equal(secondPage.json().items.length, 1);
    assert.equal(firstPage.json().pagination.page, 1);
    assert.equal(firstPage.json().pagination.pageSize, 1);
    assert.equal(typeof firstPage.json().pagination.totalItems, 'number');
    assert.equal(typeof firstPage.json().pagination.hasMore, 'boolean');
    assert.notEqual(firstPage.json().items[0].id, secondPage.json().items[0].id);
  } finally {
    await app.close();
  }
});

test('settings updates sync the newsletter schedule when cadence changes', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const cookie = await login(app, 'alex', 'fieldguide123');
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me/settings',
      headers: {
        cookie
      },
      payload: {
        newsletterEnabled: true,
        newsletterCadence: 'daily'
      }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(queues.syncedNewsletters.at(-1), {
      username: 'alex',
      enabled: true,
      mode: 'daily'
    });
  } finally {
    await app.close();
  }
});

test('protected content-mode switch requires password verification', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const cookie = await login(app, 'alex', 'fieldguide123');

    const denied = await app.inject({
      method: 'POST',
      url: '/v1/account/content-mode/switch',
      headers: {
        cookie
      },
      payload: {
        nextMode: 'adult'
      }
    });

    assert.equal(denied.statusCode, 400);

    const allowed = await app.inject({
      method: 'POST',
      url: '/v1/account/content-mode/switch',
      headers: {
        cookie
      },
      payload: {
        nextMode: 'adult',
        password: 'fieldguide123'
      }
    });

    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.json().nextMode, 'adult');
  } finally {
    await app.close();
  }
});

test('admin routes reject non-admin users and schedule new sources for ingestion', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const userCookie = await login(app, 'alex', 'fieldguide123');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/admin/dashboard',
      headers: {
        cookie: userCookie
      }
    });

    assert.equal(forbidden.statusCode, 403);

    const usageForbidden = await app.inject({
      method: 'GET',
      url: '/v1/admin/usage-summary',
      headers: {
        cookie: userCookie
      }
    });

    assert.equal(usageForbidden.statusCode, 403);

    const adminCookie = await login(app, 'admin', 'fieldguide123');
    const usageResponse = await app.inject({
      method: 'GET',
      url: '/v1/admin/usage-summary',
      headers: {
        cookie: adminCookie
      }
    });

    assert.equal(usageResponse.statusCode, 200);
    assert.deepEqual(usageResponse.json().summary, store.getAdminAiUsageSummary());

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/sources',
      headers: {
        cookie: adminCookie
      },
      payload: {
        ...DEMO_SOURCES.find((source) => source.id === 'src-geography-now'),
        name: 'Test Channel',
        slug: 'test-channel',
        siteUrl: 'https://example.com/channel',
        iconUrl: 'https://example.com/icon.png',
        feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCtestchannel1234567890',
        id: undefined
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(queues.scheduledSources.length, 1);
    assert.equal(queues.scheduledSources[0]?.feedUrl, 'https://www.youtube.com/feeds/videos.xml?channel_id=UCtestchannel1234567890');
  } finally {
    await app.close();
  }
});

test('admin AI credential routes require admin access and affect runtime AI availability', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const userCookie = await login(app, 'alex', 'fieldguide123');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/admin/ai/credentials',
      headers: {
        cookie: userCookie
      }
    });
    assert.equal(forbidden.statusCode, 403);

    const adminCookie = await login(app, 'admin', 'fieldguide123');
    const initialHealth = await app.inject({
      method: 'GET',
      url: '/health'
    });
    assert.equal(initialHealth.statusCode, 200);
    assert.equal(initialHealth.json().aiAvailable, false);

    const initialCredentials = await app.inject({
      method: 'GET',
      url: '/v1/admin/ai/credentials',
      headers: {
        cookie: adminCookie
      }
    });
    assert.equal(initialCredentials.statusCode, 200);
    assert.equal(initialCredentials.json().credentials.openai.source, 'none');

    const saveResponse = await app.inject({
      method: 'PUT',
      url: '/v1/admin/ai/credentials',
      headers: {
        cookie: adminCookie
      },
      payload: {
        provider: 'openai',
        apiKey: 'sk-test-admin'
      }
    });
    assert.equal(saveResponse.statusCode, 200);
    assert.equal(saveResponse.json().credentials.openai.source, 'database');

    const enabledHealth = await app.inject({
      method: 'GET',
      url: '/health'
    });
    assert.equal(enabledHealth.statusCode, 200);
    assert.equal(enabledHealth.json().aiAvailable, true);

    const clearResponse = await app.inject({
      method: 'PUT',
      url: '/v1/admin/ai/credentials',
      headers: {
        cookie: adminCookie
      },
      payload: {
        provider: 'openai',
        clear: true
      }
    });
    assert.equal(clearResponse.statusCode, 200);
    assert.equal(clearResponse.json().credentials.openai.source, 'none');

    const clearedHealth = await app.inject({
      method: 'GET',
      url: '/health'
    });
    assert.equal(clearedHealth.statusCode, 200);
    assert.equal(clearedHealth.json().aiAvailable, false);
  } finally {
    await app.close();
  }
});

test('admin generated story drafts require admin access and approval before publishing', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const userCookie = await login(app, 'alex', 'fieldguide123');
    const forbidden = await app.inject({
      method: 'POST',
      url: '/v1/admin/generated-stories',
      headers: {
        cookie: userCookie
      },
      payload: {
        subject: 'history',
        prompt: 'Create a source-cited primer on early medieval trade routes.'
      }
    });
    assert.equal(forbidden.statusCode, 403);

    const adminCookie = await login(app, 'admin', 'fieldguide123');
    const requestResponse = await app.inject({
      method: 'POST',
      url: '/v1/admin/generated-stories',
      headers: {
        cookie: adminCookie
      },
      payload: {
        subject: 'history',
        prompt: 'Create a source-cited primer on early medieval trade routes.'
      }
    });

    assert.equal(requestResponse.statusCode, 200);
    const draft = requestResponse.json().draft as { id: string; status: string; citations: unknown[] };
    assert.equal(draft.status, 'draft');
    assert.ok(draft.citations.length > 0);
    assert.deepEqual(queues.generatedDrafts, [draft.id]);

    const beforeFeedResponse = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=history'
    });
    assert.equal(beforeFeedResponse.statusCode, 200);
    assert.equal(
      beforeFeedResponse
        .json()
        .items.some((item: { kind: string }) => item.kind === 'generated_story'),
      false
    );

    const approveResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/generated-stories/${draft.id}/review`,
      headers: {
        cookie: adminCookie
      },
      payload: {
        decision: 'approved'
      }
    });

    assert.equal(approveResponse.statusCode, 200);
    assert.equal(approveResponse.json().draft.status, 'approved');
    assert.equal(approveResponse.json().item.kind, 'generated_story');

    const afterFeedResponse = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=history&pageSize=50'
    });
    assert.equal(afterFeedResponse.statusCode, 200);
    assert.equal(
      afterFeedResponse
        .json()
        .items.some((item: { id: string }) => item.id === approveResponse.json().item.id),
      true
    );
  } finally {
    await app.close();
  }
});

test('media relay proxies remote images through the API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://example.com/image.png');
    assert.equal((init?.headers as Record<string, string>)['user-agent'], 'FieldguideMediaRelay/0.1 (+http://localhost:4000)');
    return new Response(Buffer.from('image-bytes'), {
      status: 200,
      headers: {
        'content-type': 'image/png'
      }
    });
  };

  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/media?url=${encodeURIComponent('https://example.com/image.png')}`
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/png');
    assert.match(String(response.headers['cache-control']), /max-age=3600/);
    assert.equal(response.body, 'image-bytes');
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('media relay rejects non-http image protocols', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/media?url=${encodeURIComponent('ftp://example.com/image.png')}`
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('admin pinning stays scoped to the item feed and can be cleared again', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const adminCookie = await login(app, 'admin', 'fieldguide123');

    const beforeResponse = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=photography'
    });
    assert.equal(beforeResponse.statusCode, 200);
    assert.equal(beforeResponse.json().pinnedItems.some((item: { id: string }) => item.id === 'item-photo'), false);

    const pinResponse = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/item-photo/pin',
      headers: {
        cookie: adminCookie
      },
      payload: {
        slot: 0
      }
    });
    assert.equal(pinResponse.statusCode, 200);
    assert.equal(pinResponse.json().item.id, 'item-photo');
    assert.equal(pinResponse.json().item.pinned, true);

    const photographyFeedResponse = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=photography'
    });
    assert.equal(photographyFeedResponse.statusCode, 200);
    assert.equal(
      photographyFeedResponse
        .json()
        .pinnedItems.some((item: { id: string }) => item.id === 'item-photo'),
      true
    );

    const historyFeedResponse = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=history'
    });
    assert.equal(historyFeedResponse.statusCode, 200);
    assert.equal(
      historyFeedResponse
        .json()
        .pinnedItems.some((item: { id: string }) => item.id === 'item-sutton-hoo'),
      true
    );

    const clearResponse = await app.inject({
      method: 'PATCH',
      url: '/v1/admin/items/item-photo',
      headers: {
        cookie: adminCookie
      },
      payload: {
        pinned: false
      }
    });
    assert.equal(clearResponse.statusCode, 200);
    assert.equal(clearResponse.json().item.pinned, false);

    const afterClearResponse = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=photography'
    });
    assert.equal(afterClearResponse.statusCode, 200);
    assert.equal(afterClearResponse.json().pinnedItems.length, 0);
  } finally {
    await app.close();
  }
});

test('approved community submissions appear in the community feed and author profile', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const title = `API Community ${Date.now()}`;
    const userCookie = await login(app, 'mila', 'fieldguide123');
    const adminCookie = await login(app, 'admin', 'fieldguide123');

    const submitResponse = await app.inject({
      method: 'POST',
      url: '/v1/submissions',
      headers: {
        cookie: userCookie
      },
      payload: {
        type: 'community_post',
        title,
        body: 'An approval-flow test post.'
      }
    });

    assert.equal(submitResponse.statusCode, 200);
    const submissionId = submitResponse.json().submission.id as string;

    const approveResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/submissions/${submissionId}/review`,
      headers: {
        cookie: adminCookie
      },
      payload: {
        decision: 'approved'
      }
    });

    assert.equal(approveResponse.statusCode, 200);
    const approvedItem = approveResponse.json().item as { slug: string; originalTitle: string } | null;
    assert.ok(approvedItem);

    const communityFeedResponse = await app.inject({
      method: 'GET',
      url: '/v1/feed?feed=community&pageSize=50'
    });

    assert.equal(communityFeedResponse.statusCode, 200);
    assert.equal(
      communityFeedResponse
        .json()
        .items.some((item: { slug: string }) => item.slug === approvedItem?.slug),
      true
    );

    const profileResponse = await app.inject({
      method: 'GET',
      url: '/v1/profile/mila'
    });

    assert.equal(profileResponse.statusCode, 200);
    assert.equal(profileResponse.json().displayName, 'Mila Petrova');
    assert.equal(
      profileResponse
        .json()
        .items.some((item: { slug: string }) => item.slug === approvedItem?.slug),
      true
    );

    const adminProfileResponse = await app.inject({
      method: 'GET',
      url: '/v1/profile/admin'
    });

    assert.equal(adminProfileResponse.statusCode, 200);
    assert.equal(adminProfileResponse.json().username, 'admin');
    assert.equal(adminProfileResponse.json().items.length, 0);
  } finally {
    await app.close();
  }
});

test('community link submissions reject Fieldguide URLs as source links', async () => {
  const { store, queues } = createHarness();
  const app = await buildApp({ config: testConfig, store, queues });

  try {
    const userCookie = await login(app, 'mila', 'fieldguide123');

    const submitResponse = await app.inject({
      method: 'POST',
      url: '/v1/submissions',
      headers: {
        cookie: userCookie
      },
      payload: {
        type: 'link',
        title: 'Recursive community link',
        sourceUrl: `${testConfig.APP_URL}/item/item-sutton-hoo`
      }
    });

    assert.equal(submitResponse.statusCode, 400);
    assert.match(submitResponse.json().error as string, /external source url/i);
  } finally {
    await app.close();
  }
});
