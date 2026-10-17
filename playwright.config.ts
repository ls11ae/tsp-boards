// Browser tests (Playwright) of the app as a visitor sees it, e.g. playing on a phone
// (roadmap 9.10). Not part of `npm run check`: they need a browser (`npx playwright install
// chromium` once) and run with `npm run e2e`, which starts the dev server on its own port.

import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 120_000,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}/` },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
  },
});
