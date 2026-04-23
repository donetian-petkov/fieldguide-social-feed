import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(rootDir, 'docs', 'screenshots');
const apiUrl = process.env.SCREENSHOT_API_URL || 'http://localhost:4000';
const webUrl = process.env.SCREENSHOT_WEB_URL || 'http://localhost:3000';
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
        PORT: '4000',
        APP_URL: webUrl,
        DEMO_MODE: 'true',
        ENABLE_EMAIL: 'false',
        COOKIE_SECRET: 'replace-with-a-long-random-string'
      }
    });
  }

  if (!(await isReachable(`${webUrl}/auth`))) {
    startProcess('web', process.execPath, ['../../node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3000'], {
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
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: false
  });
  console.log(`Captured ${fileName}`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await ensureServers();

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      baseURL: webUrl,
      deviceScaleFactor: 1
    });
    const page = await context.newPage();

    await login(page, 'alex');
    await capture(page, 'feed-history.png', '/feed/history', 'Pinned stories');
    await capture(page, 'item-detail.png', '/item/the-bell-rhythms-of-kukeri-season', 'Ask AI');
    await capture(page, 'community.png', '/community', 'Submit to community');

    await context.clearCookies();
    await login(page, 'admin');
    await capture(page, 'admin-moderation.png', '/admin/moderation', 'Recent Items');
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
