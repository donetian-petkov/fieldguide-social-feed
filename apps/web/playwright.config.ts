import { defineConfig } from '@playwright/test';

const useExistingServers = process.env.PW_USE_EXISTING_SERVERS === 'true';

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
    baseURL: 'http://localhost:3000',
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
            PORT: '4000',
            APP_URL: 'http://localhost:3000',
            DEMO_MODE: 'true',
            ENABLE_EMAIL: 'false',
            COOKIE_SECRET: 'replace-with-a-long-random-string'
          },
          url: 'http://localhost:4000/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        },
        {
          command: '../../node_modules/.bin/next start -H 127.0.0.1 -p 3000',
          cwd: '.',
          env: {
            NEXT_PUBLIC_API_URL: 'http://localhost:4000'
          },
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      ]
});
