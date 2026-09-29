import { defineConfig } from '@playwright/test';

const useExistingServers = process.env.PW_USE_EXISTING_SERVERS === 'true';
const webPort = process.env.E2E_WEB_PORT || '3000';
const apiPort = process.env.E2E_API_PORT || '4000';
const webUrl = `http://localhost:${webPort}`;
const apiUrl = `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  reporter: 'list',
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: useExistingServers
    ? undefined
    : [
        {
          command: 'node apps/api/dist/server.js',
          cwd: '../..',
          env: {
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
          },
          url: `${apiUrl}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        },
        {
          command: `../../node_modules/.bin/next start -H 127.0.0.1 -p ${webPort}`,
          cwd: '.',
          env: {
            NEXT_PUBLIC_API_URL: apiUrl
          },
          url: `http://127.0.0.1:${webPort}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      ]
});
