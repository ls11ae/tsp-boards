// Browser tests (Playwright) of the app as a visitor sees it, e.g. playing on a phone
// (roadmap 9.10). Not part of `npm run check`: they need a browser (`npx playwright install
// chromium` once) and run with `npm run e2e`, which starts the dev server on its own port and,
// for the offline test (roadmap 9.17), a production build with its service worker.

import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
/** The production build (service worker) for e2e/offline.e2e.ts. */
export const PREVIEW_PORT = 5175;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 120_000,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}/` },
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}/`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
