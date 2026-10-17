// The booth offline (roadmap 9.17): after one visit of the production build its service worker
// has cached the app, the solver, the maps and the puzzles; then, without a network, the kiosk
// with its table label opens, a puzzle loads and the exact solver finds its optimum, and the
// table's leaderboard opens.

import { expect, test } from '@playwright/test';
import { PREVIEW_PORT } from '../playwright.config';

test.use({
  viewport: { width: 1280, height: 860 },
  locale: 'de-DE',
  baseURL: `http://localhost:${PREVIEW_PORT}/`,
  serviceWorkers: 'allow',
});

test('the kiosk works offline after the first visit', async ({ page, context }) => {
  await page.goto('/#kiosk?table=1');
  await expect(page.locator('.kiosk-table')).toHaveText('Tisch 1');
  // The service worker is installed (all files precached) and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.kiosk-table')).toHaveText('Tisch 1');
  await page.locator('.kiosk-card', { hasText: 'Ruhrgebiet' }).click();
  await expect(page.locator('.kiosk-play')).toHaveCount(1);
  await expect(page.locator('.play-place')).toHaveCount(11);
  // The optimum comes from the exact solver (HiGHS WebAssembly from the cache).
  await expect(page.getByRole('button', { name: 'Lösung zeigen' })).toBeEnabled({
    timeout: 60_000,
  });
  await expect(page.locator('.daily-scores h2')).toHaveText('Bestenliste des Tages – Tisch 1');

  // A world puzzle (the world map and the globe) and the second screen's leaderboards.
  await page.goto('about:blank');
  await page.goto('/#kiosk?table=1');
  await page.locator('.kiosk-card strong', { hasText: /^Rund um die Welt$/ }).click();
  await expect(page.locator('.globe-labels text').first()).toBeVisible();
  await page.goto('about:blank');
  await page.goto('/#kiosk/scores?table=1');
  await expect(page.locator('.kiosk-scores h1')).toHaveText('Bestenliste des Tages – Tisch 1');
});
