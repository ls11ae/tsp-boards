// The app in English (roadmap 9.16): curated puzzles with English titles and descriptions in
// the gallery and the play view, places with their English names (Munich ×2, Tokyo, Moscow,
// Rhine-Main Universities, Bonn/Cologne) on the map, on the globe and in the kiosk.
// Screenshots go to test-results/english/.

import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 860 }, locale: 'en-GB' });

const SHOTS = 'test-results/english';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tsp-boards.lang', 'en'));
});

/** Names of the places on the board or globe (their tooltips). */
const placeTitles = (page: Page) => page.locator('.play-place title').allTextContents();

test('the gallery in English', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.card h4', { hasText: 'Summer Olympic Games' })).toHaveCount(1);
  await expect(page.locator('h3', { hasText: 'Europe and the world' })).toHaveCount(1);
  await expect(page.locator('.card h4', { hasText: 'Olympische' })).toHaveCount(0);
  await expect(page.locator('.card-description', { hasText: 'Rundreise' })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/gallery.png` });
});

test('a German puzzle with English place names', async ({ page }) => {
  await page.goto('/#p/exzellenzstrategie-2027-brett');
  await expect(page.locator('.board-title h2')).toHaveText('Excellence Strategy 2026–2033');
  await expect(page.locator('.board-title .hint')).toContainText('North Rhine-Westphalia');
  const names = await placeTitles(page);
  expect(names).toContain('Munich');
  expect(names).toContain('Cologne');
  expect(names).toContain('Rhine-Main Universities (Darmstadt, Frankfurt am Main, Mainz)');
  expect(names).not.toContain('München');
  // The board's legend in English too.
  await expect(page.locator('.place-legend')).toContainText('University of Excellence');
  await page.screenshot({ path: `${SHOTS}/excellence.png` });
  await page.goto('/#p/exzellenzuniversitaeten-2027-brett');
  await expect(page.locator('.next-place option', { hasText: 'Bonn/Cologne' })).toHaveCount(1);
});

test('the globe in English', async ({ page }) => {
  await page.goto('/#p/welt-30');
  await expect(page.locator('.board-title h2')).toHaveText('World: 30 metropolises');
  const labels = page.locator('.globe-labels text');
  await expect(labels.first()).toBeVisible();
  const texts = await labels.allTextContents();
  expect(texts).toEqual(expect.arrayContaining(['Tokyo', 'Moscow', 'Beijing']));
  expect(texts).not.toContain('Tokio');
  await page.screenshot({ path: `${SHOTS}/globe.png` });
});

test('the kiosk in English', async ({ page }) => {
  await page.goto('/#kiosk');
  await expect(page.locator('.kiosk-card', { hasText: 'Ruhr area: 11 cities' })).toHaveCount(1);
  await expect(page.locator('.kiosk-card', { hasText: 'Ruhrgebiet' })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/kiosk.png` });
  await page.locator('.kiosk-card strong', { hasText: /^Around the world$/ }).click();
  await expect(page.locator('.kiosk-header h1')).toHaveText('Around the world');
  await expect(page.locator('.panel.side h2').first()).toContainText('from Los Angeles to Sydney');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  const names = await placeTitles(page);
  expect(names).toEqual(expect.arrayContaining(['Mexico City', 'Saint Petersburg', 'Cairo']));
  await page.screenshot({ path: `${SHOTS}/kiosk-world.png` });
});
