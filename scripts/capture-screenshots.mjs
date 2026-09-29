import { mkdir, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(rootDir, 'docs', 'screenshots');
const videoDir = path.join(rootDir, 'tmp', 'screenshot-videos');
const apiUrl = process.env.SCREENSHOT_API_URL || 'http://localhost:4000';
const webUrl = process.env.SCREENSHOT_WEB_URL || 'http://localhost:3000';
const apiPort = new URL(apiUrl).port || '4000';
const webPort = new URL(webUrl).port || '3000';
const viewport = { width: 1440, height: 900 };
const children = [];

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function startProcess(label, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  child.stdout.on('data', (data) => {
    process.stdout.write(`[${label}] ${data}`);
  });
  child.stderr.on('data', (data) => {
    process.stderr.write(`[${label}] ${data}`);
  });
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      process.stderr.write(`[${label}] exited with code ${code}${signal ? ` (${signal})` : ''}\n`);
    }
  });
  return child;
}

async function waitFor(url, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become reachable at ${url}`);
}

async function ensureServers() {
  if (!(await isReachable(`${apiUrl}/health`))) {
    startProcess('api', process.execPath, ['apps/api/dist/server.js'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: apiPort,
        APP_URL: webUrl,
        DEMO_MODE: 'true',
        ENABLE_EMAIL: 'false',
        COOKIE_SECRET: 'replace-with-a-long-random-string',
        // Fixture mode never calls a provider (Ask-AI uses canned answers); the placeholder
        // key only makes the AI surfaces render so they can be tested.
        OPENAI_API_KEY: 'fixture-mode-placeholder',
        ANTHROPIC_API_KEY: '',
        OPENROUTER_API_KEY: '',
        OLLAMA_BASE_URL: '',
        FIELDGUIDE_ENV_OVERRIDE: 'true'
      }
    });
  }

  if (!(await isReachable(`${webUrl}/auth`))) {
    startProcess('web', process.execPath, ['../../node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', webPort], {
      cwd: path.join(rootDir, 'apps', 'web'),
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: apiUrl
      }
    });
  }

  await waitFor(`${apiUrl}/health`, 'API');
  await waitFor(`${webUrl}/auth`, 'Web');
}

async function login(page, username) {
  await page.goto(`${webUrl}/auth`, { waitUntil: 'networkidle' });
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('fieldguide123');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(/\/feed\/history$/);
}

async function capture(page, fileName, url, readyText) {
  await page.goto(`${webUrl}${url}`, { waitUntil: 'networkidle' });
  await page.getByText(readyText, { exact: false }).first().waitFor({ state: 'visible' });
  await pause(400);
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: false
  });
  console.log(`Captured ${fileName}`);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

// Two-pass palette conversion keeps the GIFs sharp and reasonably small.
function convertToGif(videoPath, gifPath) {
  const filters = 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5';
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoPath, '-vf', filters, '-loop', '0', gifPath], {
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${gifPath}`);
}

async function recordGif(browser, fileName, username, flow) {
  const context = await browser.newContext({
    viewport,
    baseURL: webUrl,
    recordVideo: { dir: videoDir, size: viewport }
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webUrl });
  const page = await context.newPage();
  await login(page, username);
  await flow(page);
  await pause(800);
  const video = page.video();
  await context.close();
  convertToGif(await video.path(), path.join(outputDir, fileName));
  console.log(`Captured ${fileName}`);
}

async function captureScreenshots(browser) {
  const context = await browser.newContext({ viewport, baseURL: webUrl, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await login(page, 'alex');
  await capture(page, 'feed-history.png', '/feed/history', 'Pinned stories');
  await capture(page, 'item-detail.png', '/item/the-bell-rhythms-of-kukeri-season', 'Ask AI');
  await capture(page, 'community.png', '/community', 'Submit to community');
  await capture(page, 'album.png', '/albums/album-1', 'Quiet History');
  await capture(page, 'settings.png', '/settings', 'Protected content modes');

  await context.clearCookies();
  await login(page, 'admin');
  await capture(page, 'admin-moderation.png', '/admin/moderation', 'Recent Items');
  await capture(page, 'admin-sources.png', '/admin/sources', 'Sources');
  await context.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: webUrl,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobile.newPage();
  await login(mobilePage, 'alex');
  await capture(mobilePage, 'feed-mobile.png', '/feed/art', 'Art');
  await mobile.close();
}

async function captureGifs(browser) {
  if (!hasFfmpeg()) {
    console.warn('ffmpeg not found; skipping GIF capture.');
    return;
  }
  await rm(videoDir, { recursive: true, force: true });

  await recordGif(browser, 'ask-ai.gif', 'alex', async (page) => {
    await page.goto(`${webUrl}/item/the-bell-rhythms-of-kukeri-season`, { waitUntil: 'networkidle' });
    const askAi = page.getByRole('heading', { name: 'Ask AI' }).locator('..').locator('..');
    await askAi.scrollIntoViewIfNeeded();
    await pause(600);
    await askAi.locator('[data-ask-ai-input]').pressSequentially('What should I research next?', { delay: 45 });
    await askAi.getByRole('button', { name: 'Ask' }).click();
    const answer = askAi.getByText(/Your question was/);
    await answer.waitFor();
    await page.mouse.wheel(0, 250);
    await pause(1500);
  });

  await recordGif(browser, 'browse-and-share.gif', 'alex', async (page) => {
    await page.goto(`${webUrl}/feed/art`, { waitUntil: 'networkidle' });
    await pause(900);
    await page.mouse.wheel(0, 500);
    await pause(900);
    await page.mouse.wheel(0, -500);
    await pause(600);
    const card = page
      .locator('[role="link"]')
      .filter({ has: page.locator('a[href="/item/how-vermeer-builds-silence-through-light"]') })
      .filter({ has: page.getByRole('button', { name: 'Hide item' }) })
      .first();
    await card.getByRole('button', { name: 'Share' }).click();
    await pause(900);
    await page.getByRole('menuitem', { name: /Copy story link/ }).click();
    await page.getByText('Story link copied.').waitFor();
    await pause(1200);
  });

  await recordGif(browser, 'admin-console.gif', 'admin', async (page) => {
    for (const [route, ready] of [
      ['/admin', 'Sources'],
      ['/admin/sources', 'Sources'],
      ['/admin/moderation', 'Recent Items'],
      ['/admin/users', 'Users']
    ]) {
      await page.goto(`${webUrl}${route}`, { waitUntil: 'networkidle' });
      await page.getByText(ready, { exact: false }).first().waitFor();
      await pause(1400);
    }
  });

  await rm(videoDir, { recursive: true, force: true });
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await ensureServers();

  const browser = await chromium.launch();
  try {
    await captureScreenshots(browser);
    if (process.env.SKIP_GIFS !== 'true') {
      await captureGifs(browser);
    }
  } finally {
    await browser.close();
    for (const child of children) {
      child.kill('SIGTERM');
    }
  }

  console.log(`Screenshots saved to ${path.relative(rootDir, outputDir)}`);
}

main().catch((error) => {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  console.error(error);
  process.exitCode = 1;
});
