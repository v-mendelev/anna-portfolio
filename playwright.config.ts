import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `astro preview`.
 * The build uses a NON-ROOT base path on purpose, so any hardcoded "/..."
 * link, CSS, JS or image path fails the tests the same way it would on
 * GitHub Pages (https://<user>.github.io/<repo>/).
 */
const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_PATH = process.env.E2E_BASE_PATH ?? '/base-path-check';
const baseURL = `http://127.0.0.1:${PORT}${BASE_PATH.replace(/\/$/, '')}/`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /e2e\/(smoke|navigation|home|fonts|mobile)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-webkit',
      testMatch: /e2e\/(smoke|navigation|home|fonts|mobile)\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'responsive',
      testMatch: /e2e\/responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Opt-in: baselines are OS-specific; generate them on Linux CI (see TESTING.md).
      name: 'visual',
      testMatch: /visual\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port ' + PORT,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      DEPLOY_TARGET: 'local',
      SITE_URL: `http://127.0.0.1:${PORT}`,
      BASE_PATH,
    },
  },
});
