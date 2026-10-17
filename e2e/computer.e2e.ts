// "So rechnet der Computer" (roadmap 9.18): only behind a button after a finished game; the bar
// chart with the strategies and the optimum, a tour on the map on demand, the animation that a
// tap skips to "Bewiesen", "Zurück"; in the kiosk the view closes with "Zurück", with the next
// person and on the inactivity reset, and never leaves the kiosk. Screenshots go to
// test-results/computer/.

import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 860 }, locale: 'de-DE' });

const SHOTS = 'test-results/computer';

/** Shows the solution (the game is finished then). */
async function reveal(page: Page) {
  await page.getByRole('button', { name: 'Lösung zeigen' }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Wirklich zeigen?' }).click();
}

async function animate(page: Page, what = 'die kürzeste Rundreise') {
  const how = page.getByRole('button', { name: `So findet der Computer ${what}` });
  await expect(how).toBeEnabled({ timeout: 60_000 });
  await how.click();
  await expect(page.locator('.computer-caption')).toBeVisible();
  await expect(page.locator('.teach-edge')).toHaveCount(1);
}

test('the comparison and the animation after a game', async ({ page }) => {
  await page.goto('/#p/ruhrgebiet-11');
  await expect(page.locator('.play-place')).toHaveCount(11);
  // Nothing before the game is finished.
  await expect(page.getByRole('button', { name: 'So rechnet der Computer' })).toHaveCount(0);
  await reveal(page);
  await page.getByRole('button', { name: 'So rechnet der Computer' }).click();
  const rows = page.locator('.computer-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.last()).toContainText('am kürzesten');
  // A strategy's tour on the map on demand.
  await expect(page.locator('.play-board .computer-tour')).toHaveCount(0);
  await rows.filter({ hasText: 'Nächster Nachbar' }).click();
  await expect(page.locator('.play-board .computer-tour')).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/compare.png` });

  await animate(page);
  await page.screenshot({ path: `${SHOTS}/animation.png` });
  // A tap on the map skips to the proof.
  await page.locator('.play-board svg.board').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('.computer-caption')).toHaveText(
    'Bewiesen: Keine Rundreise ist kürzer!',
  );
  await page.screenshot({ path: `${SHOTS}/proven.png` });
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.locator('.computer-row')).toHaveCount(4);
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.locator('.computer-view')).toHaveCount(0);
});

test('the comparison of a played round trip and a world path', async ({ page }) => {
  await page.goto('/#p/welt-pazifik');
  // The keyboard list: the places in alphabetical order, Sydney last.
  const select = page.locator('.next-place select');
  await expect(select).toBeVisible();
  for (;;) {
    const options = (await select.locator('option').allTextContents()).slice(1);
    if (options.length === 0) break;
    await select.selectOption({ label: options[0]! });
    await page.locator('.next-place button[type=submit]').click();
  }
  await expect(page.locator('.play-result')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'So rechnet der Computer' }).click();
  const rows = page.locator('.computer-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Dein Weg');
  await expect(rows.first()).toContainText('km');
  await rows.first().click();
  await expect(page.locator('.computer-tour')).toHaveCount(1);
  // On the globe (where world puzzles start).
  await animate(page, 'den kürzesten Weg');
  await expect(page.locator('.globe .teach-edge')).toHaveCount(1);
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.locator('.computer-caption')).toHaveText('Bewiesen: Kein Weg ist kürzer!');
});

test('in the kiosk the view closes and stays inside the kiosk', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#kiosk');
  await page.locator('.kiosk-card', { hasText: 'Ruhrgebiet' }).click();
  await reveal(page);
  await page.getByRole('button', { name: 'So rechnet der Computer' }).click();
  await expect(page.locator('.computer-view')).toHaveCount(1);
  // The next person: a new game, the view is gone.
  await page.getByRole('button', { name: 'Nächste Person' }).click();
  await expect(page.locator('.computer-view')).toHaveCount(0);
  await reveal(page);
  await page.getByRole('button', { name: 'So rechnet der Computer' }).click();
  await animate(page);
  await expect(page.locator('a[href]')).toHaveCount(0);
  // Two minutes without a touch: back to the start screen, the view closed.
  await page.clock.fastForward(130_000);
  await expect(page.locator('.kiosk-start')).toHaveCount(1);
  await page.locator('.kiosk-card', { hasText: 'Ruhrgebiet' }).click();
  await expect(page.locator('.computer-view')).toHaveCount(0);
  expect(new URL(page.url()).hash).toMatch(/^#kiosk/);
});
