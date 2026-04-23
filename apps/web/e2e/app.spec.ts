import { expect, test, type Locator, type Page } from '@playwright/test';

async function loginAs(page: Page, username: 'alex' | 'admin' | 'mila' = 'alex') {
  await page.goto('/auth');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('fieldguide123');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/feed\/history$/);
}

function sectionCard(page: Page, heading: string) {
  return page.getByRole('heading', { name: heading }).locator('..').locator('..');
}

function feedCardBySlug(page: Page, slug: string) {
  return page
    .locator('[role="link"]')
    .filter({ has: page.locator(`a[href="/item/${slug}"]`) })
    .filter({ has: page.getByRole('button', { name: 'Hide item' }) })
    .first();
}

test('login opens the history feed and keyboard help dialog', async ({ page }) => {
  await loginAs(page, 'alex');

  await expect(page.getByRole('banner').getByText('History', { exact: true })).toBeVisible();
  await expect(page.getByText('Pinned stories')).toBeVisible();
  await expect(page.locator('a[href^="/item/"]').filter({ hasText: 'Open story' }).first()).toHaveAttribute('href', /\/item\//);

  await page.keyboard.press('Shift+Slash');
  await expect(page.getByRole('dialog')).toContainText('Keyboard shortcuts');
  await expect(page.getByText('`[` and `]` switch subject feeds')).toBeVisible();
});

test('feed ask-ai flow returns an article-scoped answer', async ({ page }) => {
  await loginAs(page, 'alex');
  await page.goto('/item/the-bell-rhythms-of-kukeri-season');

  await expect(page.getByRole('heading', { name: 'AI audit' })).toHaveCount(0);

  const askAiSection = page.getByRole('heading', { name: 'Ask AI' }).locator('..').locator('..');
  await askAiSection.locator('[data-ask-ai-input]').fill('What should I research next?');
  await askAiSection.getByRole('button', { name: 'Ask' }).click();

  await expect(askAiSection.getByText(/Your question was: What should I research next\?/)).toBeVisible();
});

test('settings support album creation and protected mode switching', async ({ page }) => {
  const albumTitle = `E2E Album ${Date.now()}`;

  await loginAs(page, 'mila');
  await page.goto('/settings');

  await page.getByLabel('Album title').fill(albumTitle);
  await page.getByLabel('Album description').fill('Browser-level verification album.');
  await page.getByRole('button', { name: 'Create album' }).click();

  await expect(page.getByText('Album created.')).toBeVisible();
  await expect(page.getByText(new RegExp(albumTitle))).toBeVisible();

  await page.getByLabel('Next mode').click();
  await page.getByRole('option', { name: 'Adult' }).click();
  await page.getByLabel('Account password').fill('fieldguide123');
  await page.getByRole('button', { name: 'Verify and switch' }).click();

  await expect(page.getByText('Protected mode switched to adult.')).toBeVisible();
});

test('settings persist newsletter preferences and Ask-AI disablement', async ({ page }) => {
  test.setTimeout(60_000);
  const appearanceCard = sectionCard(page, 'Appearance');
  const aiPreferencesCard = sectionCard(page, 'AI preferences');
  const newsletterSwitch = appearanceCard.getByText('Newsletter enabled').locator('..').getByRole('switch');
  const askAiSwitch = aiPreferencesCard.getByText('Ask-AI enabled').locator('..').getByRole('switch');
  const newsletterCadenceField = appearanceCard.getByText('Newsletter cadence').locator('..').getByRole('combobox');

  async function setSwitch(input: Locator, checked: boolean, successMessage: string) {
    if ((await input.isChecked()) !== checked) {
      await input.evaluate((element, nextChecked) => {
        const checkbox = element as HTMLInputElement;
        if (checkbox.checked !== nextChecked) {
          checkbox.click();
        }
      }, checked);
      if (checked) {
        await expect(input).toBeChecked();
      } else {
        await expect(input).not.toBeChecked();
      }
      await expect(page.getByText(successMessage)).toBeVisible();
    }
  }

  async function setNewsletterCadence(label: 'Daily' | 'Weekly') {
    if (!((await newsletterCadenceField.textContent()) || '').includes(label)) {
      await newsletterCadenceField.click();
      await page.getByRole('option', { name: label }).click();
      await expect(page.getByText('Newsletter cadence saved.')).toBeVisible();
    }
  }

  try {
    await loginAs(page, 'alex');
    await page.goto('/settings');
    await expect(newsletterCadenceField).toBeVisible();

    await setSwitch(newsletterSwitch, true, 'Newsletter preference saved.');
    await setNewsletterCadence('Weekly');
    await setSwitch(askAiSwitch, true, 'Ask-AI preference saved.');

    await setSwitch(newsletterSwitch, false, 'Newsletter preference saved.');
    await setNewsletterCadence('Daily');
    await setSwitch(askAiSwitch, false, 'Ask-AI preference saved.');

    await page.reload();
    await expect(newsletterSwitch).not.toBeChecked();
    await expect(newsletterCadenceField).toContainText('Daily');
    await expect(askAiSwitch).not.toBeChecked();

    await page.goto('/item/the-bell-rhythms-of-kukeri-season');
    const askAiSection = page.getByRole('heading', { name: 'Ask AI' }).locator('..').locator('..');
    await expect(askAiSection.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await expect(askAiSection.getByText('Enable Ask-AI in settings to ask questions.')).toBeVisible();
  } finally {
    try {
      const cleanup = await page.evaluate(async () => {
        const response = await fetch('http://localhost:4000/v1/me/settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            newsletterEnabled: true,
            newsletterCadence: 'weekly',
            askAiEnabled: true
          })
        });

        return response.status;
      });
      expect(cleanup).toBe(200);
    } catch {
      // Best-effort cleanup so repeated runs preserve Alex's seeded settings.
    }
  }
});

test('password recovery can issue a reset token and accept a new password', async ({ page }) => {
  test.setTimeout(60_000);
  const originalPassword = 'fieldguide123';
  const nextPassword = 'fieldguide456';
  let passwordChanged = false;

  async function generateResetToken() {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Forgot' }).click();
    await page.getByLabel('Username or email').fill('alex');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    const message = await page.getByText(/Reset token generated for local testing:/).textContent();
    const token = message?.match(/Reset token generated for local testing: (reset_[\w-]+)/)?.[1];
    expect(token).toBeTruthy();
    return token!;
  }

  try {
    const token = await generateResetToken();

    await page.getByRole('tab', { name: 'Reset' }).click();
    await page.getByLabel('Reset token').fill(token);
    await page.getByLabel('New password').fill(nextPassword);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText('Password updated. Sign in with the new password.')).toBeVisible();
    passwordChanged = true;

    await page.getByLabel('Username').fill('alex');
    await page.getByLabel('Password').fill(nextPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/feed\/history$/);
  } finally {
    if (passwordChanged) {
      try {
        const revertToken = await generateResetToken();
        await page.getByRole('tab', { name: 'Reset' }).click();
        await page.getByLabel('Reset token').fill(revertToken);
        await page.getByLabel('New password').fill(originalPassword);
        await page.getByRole('button', { name: 'Reset password' }).click();
        await expect(page.getByText('Password updated. Sign in with the new password.')).toBeVisible();
      } catch {
        // Best-effort cleanup so repeated runs keep the seeded demo password intact.
      }
    }
  }
});

test('album detail lets users save metadata and change the cover image', async ({ page }) => {
  test.setTimeout(60_000);
  const originalDescription = 'Artifacts, archaeology, and visual storytelling.';
  const nextDescription = `${originalDescription} Browser E2E ${Date.now()}.`;
  const originalCoverTitle = 'What the Sutton Hoo ship burial still teaches us about early medieval power';
  const nextCoverTitle = 'How Vermeer builds silence through light';
  const coverSectionTitle = 'Album cover';
  let descriptionChanged = false;
  let coverChanged = false;

  try {
    await loginAs(page, 'alex');
    await page.goto('/albums/album-1');

    await expect(page.getByRole('heading', { name: 'Quiet History' })).toBeVisible();
    await page.getByLabel('Album description').fill(nextDescription);
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByText('Album details saved.')).toBeVisible();
    descriptionChanged = true;

    await page.reload();
    await expect(page.getByLabel('Album description')).toHaveValue(nextDescription);
    await expect(sectionCard(page, coverSectionTitle).getByRole('img', { name: originalCoverTitle })).toBeVisible();

    await page.getByRole('button', { name: 'Set as cover' }).first().click();
    await expect(page.getByText('Album cover updated.')).toBeVisible();
    await expect(sectionCard(page, coverSectionTitle).getByRole('img', { name: nextCoverTitle })).toBeVisible();
    coverChanged = true;
  } finally {
    if (coverChanged || descriptionChanged) {
      try {
        await page.goto('/albums/album-1');
        if (coverChanged && (await page.getByRole('button', { name: 'Set as cover' }).count())) {
          await page.getByRole('button', { name: 'Set as cover' }).first().click();
          await expect(sectionCard(page, coverSectionTitle).getByRole('img', { name: originalCoverTitle })).toBeVisible();
        }
        if (descriptionChanged) {
          await page.getByLabel('Album description').fill(originalDescription);
          await page.getByRole('button', { name: 'Save details' }).click();
          await expect(page.getByText('Album details saved.')).toBeVisible();
        }
      } catch {
        // Best-effort cleanup so repeated runs preserve the seeded album state.
      }
    }
  }
});

test('saving an item makes it appear in the saved feed', async ({ page }) => {
  test.setTimeout(60_000);
  const itemId = 'item-vermeer';
  const slug = 'how-vermeer-builds-silence-through-light';
  let saved = false;

  try {
    await loginAs(page, 'alex');
    await page.goto(`/item/${slug}`);
    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page.getByText('Saved to your library.')).toBeVisible();
    saved = true;

    await page.goto('/saved');
    await expect(page.locator(`a[href="/item/${slug}"]`).first()).toBeVisible();
  } finally {
    if (saved) {
      await page.evaluate(async (currentItemId) => {
        await fetch(`http://localhost:4000/v1/items/${currentItemId}/save`, {
          method: 'DELETE',
          credentials: 'include'
        });
      }, itemId).catch(() => undefined);
    }
  }
});

test('hiding an item persists after refresh for a new account', async ({ page }) => {
  test.setTimeout(60_000);
  const username = `hidee2e${Date.now()}`;
  const itemSlug = 'sutton-hoo-ship-burial-returns-to-the-feed';

  await page.goto('/auth');
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Display name').fill('Hide E2E');
  await page.getByLabel('Password').fill('fieldguide123');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/feed\/history$/);

  const itemCard = feedCardBySlug(page, itemSlug);
  await expect(itemCard).toBeVisible();
  await itemCard.getByRole('button', { name: 'Hide item' }).click();
  await expect(feedCardBySlug(page, itemSlug)).toHaveCount(0);

  await page.reload();
  await expect(feedCardBySlug(page, itemSlug)).toHaveCount(0);
});

test('admin login reaches the live admin dashboard without the fallback warning', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Submissions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Errors' })).toBeVisible();
  await expect(page.getByText('Admin API unavailable or you are not signed in as an admin. Showing fallback data.')).toHaveCount(0);
});

test('sharing a feed item copies its detail URL', async ({ browser }) => {
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3000'
  });
  const page = await context.newPage();
  const itemSlug = 'how-vermeer-builds-silence-through-light';

  try {
    await loginAs(page, 'alex');
    await page.goto('/feed/art');

    const shareResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/share') &&
        response.request().method() === 'POST' &&
        response.status() === 200
    );
    await feedCardBySlug(page, itemSlug).getByRole('button', { name: 'Share' }).click();
    const shareResponse = await shareResponsePromise;
    const result = await shareResponse.json();

    await expect(page.getByText('Share link copied.')).toBeVisible();
    expect(result.shareUrl).toContain(`/item/${itemSlug}`);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`/item/${itemSlug}`);
  } finally {
    await context.close();
  }
});

test('admin ai settings can be updated and restored', async ({ page }) => {
  test.setTimeout(60_000);
  await loginAs(page, 'admin');
  await page.goto('/admin/ai');

  const providerField = page.getByRole('combobox', { name: /^Provider/ });
  const monthlyBudgetField = page.getByLabel('Monthly budget (USD)');
  const perJobBudgetField = page.getByLabel('Per-job budget (USD)');
  const originalProvider = (await providerField.textContent())?.trim() || 'OpenAI';
  const originalMonthlyBudget = await monthlyBudgetField.inputValue();
  const originalPerJobBudget = await perJobBudgetField.inputValue();
  let changed = false;

  try {
    await providerField.click();
    await page.getByRole('option', { name: 'OpenRouter' }).click();
    await monthlyBudgetField.fill('321');
    await perJobBudgetField.fill('3.21');
    await page.getByRole('button', { name: 'Save AI Config' }).click();

    await expect(page.getByText('AI configuration saved.')).toBeVisible();
    changed = true;

    await page.reload();
    await expect(page.getByRole('combobox', { name: /^Provider/ })).toContainText('OpenRouter');
    await expect(page.getByLabel('Monthly budget (USD)')).toHaveValue('321');
    await expect(page.getByLabel('Per-job budget (USD)')).toHaveValue(/3[.,]21/);
  } finally {
    if (changed) {
      try {
        await page.goto('/admin/ai');
        await page.getByRole('combobox', { name: /^Provider/ }).click();
        await page.getByRole('option', { name: originalProvider }).click();
        await page.getByLabel('Monthly budget (USD)').fill(originalMonthlyBudget);
        await page.getByLabel('Per-job budget (USD)').fill(originalPerJobBudget);
        await page.getByRole('button', { name: 'Save AI Config' }).click();
        await expect(page.getByText('AI configuration saved.')).toBeVisible();
      } catch {
        // Best-effort cleanup so repeated runs preserve the prior AI configuration.
      }
    }
  }
});

test('admin users console supports suspend and restore', async ({ page }) => {
  test.setTimeout(60_000);
  const milaCard = sectionCard(page, 'Mila Petrova');
  let suspended = false;

  try {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await expect(milaCard).toBeVisible();
    await expect(milaCard).toContainText('Protected modes: Allowed');

    const suspendResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/v1/admin/users/mila/suspend') &&
        response.request().method() === 'POST' &&
        response.status() === 200
    );
    await milaCard.getByRole('button', { name: 'Suspend User' }).click();
    const suspendResponse = await suspendResponsePromise;
    const suspendResult = await suspendResponse.json();
    expect(suspendResult.user.protectedModeEnabled).toBe(false);
    await expect(page.getByText('User suspended.')).toBeVisible();
    await expect(milaCard).toContainText('Protected modes: Disabled');
    await expect(milaCard.getByRole('button', { name: 'Restore User' })).toBeVisible();
    suspended = true;
  } finally {
    if (suspended) {
      try {
        await page.goto('/admin/users');
        await expect(milaCard).toBeVisible();
        const restoreResponsePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/v1/admin/users/mila/suspend') &&
            response.request().method() === 'POST' &&
            response.status() === 200
        );
        await milaCard.getByRole('button', { name: 'Restore User' }).click();
        const restoreResponse = await restoreResponsePromise;
        const restoreResult = await restoreResponse.json();
        expect(restoreResult.user.protectedModeEnabled).toBe(true);
        await expect(page.getByText('User restored.')).toBeVisible();
        await expect(milaCard).toContainText('Protected modes: Allowed');
      } catch {
        // Best-effort cleanup so repeated runs leave Mila in the default restored state.
      }
    }
  }
});

test('admin pinning updates the public pinned rail for the matching feed', async ({ browser }) => {
  test.setTimeout(60_000);
  const itemId = 'item-photo';
  const title = 'Why rain and reflection still matter in street photography';
  const adminContext = await browser.newContext();
  const readerContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const readerPage = await readerContext.newPage();
  const itemCard = sectionCard(adminPage, title);
  let pinned = false;

  async function clearPinnedState() {
    const result = await adminPage.evaluate(async (currentItemId) => {
      const response = await fetch(`http://localhost:4000/v1/admin/items/${currentItemId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ pinned: false })
      });

      return {
        status: response.status,
        body: await response.text()
      };
    }, itemId);

    expect(result.status).toBe(200);
  }

  try {
    await loginAs(adminPage, 'admin');
    await loginAs(readerPage, 'alex');

    await clearPinnedState();

    await readerPage.goto('/feed/photography');
    await expect(readerPage.getByText('Pinned stories')).toHaveCount(0);
    await expect(readerPage.getByText(title)).toHaveCount(1);

    await adminPage.goto('/admin/moderation');
    await expect(itemCard).toBeVisible();
    const pinResponsePromise = adminPage.waitForResponse(
      (response) =>
        response.url().includes('/v1/admin/items/item-photo/pin') &&
        response.request().method() === 'POST' &&
        response.status() === 200
    );
    await itemCard.getByRole('button', { name: 'Pin Slot 1' }).click();
    const pinResponse = await pinResponsePromise;
    const pinResult = await pinResponse.json();
    expect(pinResult.item.id).toBe(itemId);
    expect(pinResult.item.pinned).toBe(true);
    await expect(adminPage.getByText('Item pinned to slot 1.')).toBeVisible();
    pinned = true;

    await readerPage.reload();
    await expect(readerPage.getByText('Pinned stories')).toBeVisible();
    await expect(readerPage.getByText(title)).toHaveCount(2);

    await readerPage.reload();
    await expect(readerPage.getByText('Pinned stories')).toBeVisible();
    await expect(readerPage.getByText(title)).toHaveCount(2);
  } finally {
    if (pinned) {
      try {
        await clearPinnedState();
        await readerPage.goto('/feed/photography');
        await expect(readerPage.getByText('Pinned stories')).toHaveCount(0);
        await expect(readerPage.getByText(title)).toHaveCount(1);
      } catch {
        // Best-effort cleanup so repeated runs do not leave photography pinned state behind.
      }
    }
    await Promise.allSettled([adminContext.close(), readerContext.close()]);
  }
});

test('admin removal hides an item from public feeds until it is restored', async ({ browser }) => {
  test.setTimeout(60_000);
  const title = 'Why festival programming shapes what film history remembers';
  const slug = 'why-festival-programming-shapes-what-film-history-remembers';
  const adminContext = await browser.newContext();
  const readerContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const readerPage = await readerContext.newPage();
  const itemCard = sectionCard(adminPage, title);
  let removed = false;

  try {
    await loginAs(adminPage, 'admin');
    await adminPage.goto('/admin/moderation');
    await expect(itemCard).toBeVisible();
    if (await itemCard.getByRole('button', { name: 'Restore' }).count()) {
      await itemCard.getByRole('button', { name: 'Restore' }).click();
      await expect(itemCard.getByRole('button', { name: 'Remove' })).toBeVisible();
    }

    await loginAs(readerPage, 'alex');
    await readerPage.goto('/feed/movies');
    await expect(feedCardBySlug(readerPage, slug)).toBeVisible();

    await itemCard.getByRole('button', { name: 'Remove' }).click();
    await expect(itemCard.getByRole('button', { name: 'Restore' })).toBeVisible();
    removed = true;

    await readerPage.reload();
    await expect(feedCardBySlug(readerPage, slug)).toHaveCount(0);
  } finally {
    if (removed) {
      try {
        await adminPage.goto('/admin/moderation');
        await expect(itemCard).toBeVisible();
        if (await itemCard.getByRole('button', { name: 'Restore' }).count()) {
          await itemCard.getByRole('button', { name: 'Restore' }).click();
          await expect(itemCard.getByRole('button', { name: 'Remove' })).toBeVisible();
        }
        await readerPage.goto('/feed/movies');
        await expect(feedCardBySlug(readerPage, slug)).toBeVisible();
      } catch {
        // Best-effort cleanup so repeated runs leave the moderated item publicly visible.
      }
    }
    await Promise.allSettled([adminContext.close(), readerContext.close()]);
  }
});

test('admin users console supports role promotion and restore', async ({ page }) => {
  test.setTimeout(60_000);
  let promoted = false;

  async function chooseRole(role: 'User' | 'Admin') {
    await sectionCard(page, 'Mila Petrova').getByLabel('Role').click();
    await page.getByRole('option', { name: role }).click();
  }

  try {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await expect(sectionCard(page, 'Mila Petrova')).toBeVisible();

    await chooseRole('User');
    if (await sectionCard(page, 'Mila Petrova').getByRole('button', { name: 'Save Role' }).isEnabled()) {
      await sectionCard(page, 'Mila Petrova').getByRole('button', { name: 'Save Role' }).click();
      await expect(page.getByText('User role updated.')).toBeVisible();
    }

    await chooseRole('Admin');
    const roleResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/v1/admin/users/mila/role') &&
        response.request().method() === 'POST' &&
        response.status() === 200
    );
    await sectionCard(page, 'Mila Petrova').getByRole('button', { name: 'Save Role' }).click();
    const roleResponse = await roleResponsePromise;
    const roleResult = await roleResponse.json();
    expect(roleResult.user.role).toBe('admin');
    await expect(page.getByText('User role updated.')).toBeVisible();
    promoted = true;

    await page.reload();
    await expect(sectionCard(page, 'Mila Petrova')).toContainText('admin');
  } finally {
    if (promoted) {
      try {
        await page.goto('/admin/users');
        await expect(sectionCard(page, 'Mila Petrova')).toBeVisible();
        await chooseRole('User');
        if (await sectionCard(page, 'Mila Petrova').getByRole('button', { name: 'Save Role' }).isEnabled()) {
          await sectionCard(page, 'Mila Petrova').getByRole('button', { name: 'Save Role' }).click();
          await expect(page.getByText('User role updated.')).toBeVisible();
        }
      } catch {
        // Best-effort cleanup so repeated runs keep Mila on the default user role.
      }
    }
  }
});

test('admin sources console supports create, update, pause, resync, and delete', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const name = `E2E Source ${stamp}`;
  const slug = `e2e-source-${stamp}`;
  const iconUrl = `https://example.com/icons/${slug}.png`;
  const siteUrl = `https://example.com/${slug}`;
  const feedUrl = `https://example.com/${slug}.xml`;
  const description = 'A browser-level source CRUD verification entry.';
  const updatedDescription = 'An updated browser-level source CRUD verification entry.';
  let created = false;

  try {
    await loginAs(page, 'admin');
    await page.goto('/admin/sources');

    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Icon URL').fill(iconUrl);
    await page.getByLabel('Site URL').fill(siteUrl);
    await page.getByLabel('Feed URL').fill(feedUrl);
    await page.getByLabel('Description').fill(description);
    await page.getByRole('button', { name: 'Save Source' }).click();

    await expect(page.getByText('Source saved and polling scheduled.')).toBeVisible();
    const sourceCard = sectionCard(page, name);
    await expect(sourceCard).toBeVisible();
    created = true;

    await sourceCard.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Description').fill(updatedDescription);
    await page.getByRole('button', { name: 'Update Source' }).click();
    await expect(page.getByText('Source updated.')).toBeVisible();
    await expect(sourceCard).toContainText(updatedDescription);

    await sourceCard.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Source paused.')).toBeVisible();
    await expect(sourceCard.getByRole('button', { name: 'Resume' })).toBeVisible();

    await sourceCard.getByRole('button', { name: 'Queue Resync' }).click();
    await expect(page.getByText('Source resync queued.')).toBeVisible();

    await sourceCard.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Source deleted.')).toBeVisible();
    await expect(sourceCard).toHaveCount(0);
    created = false;
  } finally {
    if (created) {
      try {
        const sourceCard = sectionCard(page, name);
        if (await sourceCard.count()) {
          await sourceCard.getByRole('button', { name: 'Delete' }).click();
          await expect(sourceCard).toHaveCount(0);
        }
      } catch {
        // Best-effort cleanup so repeated runs do not accumulate temporary sources.
      }
    }
  }
});

test('approved community submissions appear in the community feed and author profile', async ({ browser }) => {
  test.setTimeout(60_000);
  const title = `E2E Community Post ${Date.now()}`;
  const sourceUrl = `https://example.com/e2e-community-${Date.now()}`;
  const userContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const verifyContext = await browser.newContext();
  const userPage = await userContext.newPage();
  const adminPage = await adminContext.newPage();
  const verifyPage = await verifyContext.newPage();

  try {
    await loginAs(userPage, 'mila');
    await userPage.goto('/community');
    await userPage.getByLabel('Title').fill(title);
    await userPage.getByLabel('Source URL').fill(sourceUrl);
    await userPage.getByRole('button', { name: 'Submit for review' }).click();

    await expect(userPage.getByText('Submission sent to the moderation queue.')).toBeVisible();

    await loginAs(adminPage, 'admin');
    await adminPage.goto('/admin/moderation');

    const submissionCard = sectionCard(adminPage, title);
    await expect(submissionCard).toBeVisible();
    const approvalResponsePromise = adminPage.waitForResponse(
      (response) =>
        response.url().includes('/v1/admin/submissions/') &&
        response.request().method() === 'POST' &&
        response.status() === 200
    );
    await submissionCard.getByRole('button', { name: 'Approve' }).click();
    const approvalResponse = await approvalResponsePromise;
    const approvalResult = await approvalResponse.json();
    const approvedSlug = approvalResult.item?.slug as string | undefined;
    await expect(adminPage.getByText('Submission approved.')).toBeVisible();
    expect(approvedSlug).toBeTruthy();

    await verifyPage.goto('/community');
    await expect(verifyPage.locator(`a[href="/item/${approvedSlug}"]`).first()).toBeVisible();

    const profileResponsePromise = verifyPage.waitForResponse(
      (response) => response.url().includes('/v1/profile/mila') && response.request().method() === 'GET' && response.status() === 200
    );
    await verifyPage.goto('/profile/mila');
    const profileResponse = await profileResponsePromise;
    const profile = await profileResponse.json();

    expect(profile.items.some((item: { slug: string }) => item.slug === approvedSlug)).toBe(true);
    await expect(verifyPage.getByRole('heading', { name: 'Mila Petrova' })).toBeVisible();
  } finally {
    await Promise.allSettled([userContext.close(), adminContext.close(), verifyContext.close()]);
  }
});

test('admin comment locking blocks new comments until the item is unlocked again', async ({ browser }) => {
  test.setTimeout(60_000);
  const slug = 'the-bell-rhythms-of-kukeri-season';
  const title = 'The bell rhythms of Kukeri season';
  const adminContext = await browser.newContext();
  const readerContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const readerPage = await readerContext.newPage();
  const itemCardTitle = sectionCard(adminPage, title);
  let commentLockActive = false;

  try {
    await loginAs(adminPage, 'admin');
    await adminPage.goto('/admin/moderation');
    await expect(itemCardTitle).toBeVisible();

    if (await itemCardTitle.getByRole('button', { name: 'Unlock Comments' }).count()) {
      await itemCardTitle.getByRole('button', { name: 'Unlock Comments' }).click();
      await expect(adminPage.getByText('Comments unlocked.')).toBeVisible();
    }

    await itemCardTitle.getByRole('button', { name: 'Lock Comments' }).click();
    await expect(adminPage.getByText('Comments locked.')).toBeVisible();
    commentLockActive = true;

    await loginAs(readerPage, 'alex');
    await readerPage.goto(`/item/${slug}`);
    await readerPage.getByLabel('Add a comment').fill('This comment should be rejected while moderation lock is active.');
    const commentResponsePromise = readerPage.waitForResponse(
      (response) =>
        response.url().includes(`/v1/items/`) &&
        response.url().endsWith('/comments') &&
        response.request().method() === 'POST'
    );
    await readerPage.getByRole('button', { name: 'Post comment' }).click();
    const commentResponse = await commentResponsePromise;
    expect(commentResponse.status()).toBe(400);
    expect(await commentResponse.text()).toContain('Comments are locked for this item.');

    await expect(readerPage.getByText('Comment request failed.')).toBeVisible();
  } finally {
    if (commentLockActive) {
      try {
        await adminPage.goto('/admin/moderation');
        await expect(itemCardTitle).toBeVisible();
        if (await itemCardTitle.getByRole('button', { name: 'Unlock Comments' }).count()) {
          await itemCardTitle.getByRole('button', { name: 'Unlock Comments' }).click();
          await expect(adminPage.getByText('Comments unlocked.')).toBeVisible();
        }
      } catch {
        // Best-effort cleanup so repeated E2E runs start from the default unlocked state.
      }
    }
    await Promise.allSettled([adminContext.close(), readerContext.close()]);
  }
});
