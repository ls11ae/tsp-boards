// The world puzzle with the Pacific leg given (roadmap 9.15), opened by its short link: the
// given leg is drawn dashed across the map's edges, Los Angeles and Sydney are start and
// finish, Sydney is offered only last, and finishing there closes the loop and is judged.
// Screenshots go to test-results/world-path/.

import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 860 }, locale: 'de-DE' });

const SHOTS = 'test-results/world-path';

test('a path from Los Angeles to Sydney with the flight back given', async ({ page }) => {
  await page.goto('/#p/welt-pazifik');
  await expect(page.locator('.panel.side h2').first()).toContainText('von Los Angeles nach Sydney');
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  // The given leg leaves the map on both sides: two pieces.
  const given = page.locator('.play-board path.given-leg');
  await expect(given).toHaveCount(1);
  expect(((await given.getAttribute('d')) ?? '').split('M').length - 1).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.play-place.start title')).toHaveText('Los Angeles');
  await expect(page.locator('.play-place.finish title')).toHaveText('Sydney');
  await page.screenshot({ path: `${SHOTS}/start.png` });

  // The keyboard list: Los Angeles and Sydney are not offered while other places are open.
  const select = page.locator('.next-place select');
  const options = async () => (await select.locator('option').allTextContents()).slice(1);
  const first = await options();
  expect(first).not.toContain('Los Angeles');
  expect(first.some((o) => o.includes('Sydney'))).toBe(false);
  for (let left = first.length; left > 0; left--) {
    const [next] = await options();
    await select.selectOption({ label: next! });
    await page.locator('.next-place button[type=submit]').click();
  }
  const finish = await options();
  expect(finish).toEqual(['nach Sydney (Ziel)']);
  await select.selectOption({ label: finish[0]! });
  await page.locator('.next-place button[type=submit]').click();
  await expect(page.locator('.play-result')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.play-result')).toContainText('kürzeste');
  // The own path is open: the given leg closes it.
  expect((await page.locator('.play-board path.play-path').getAttribute('d')) ?? '').not.toMatch(
    /Z$/,
  );
  await page.screenshot({ path: `${SHOTS}/finished.png` });
});
