// Playing on a phone (roadmap 9.10): the 37-city Excellence Strategy puzzle at 390 × 844 with
// touch, opened by its short link, a whole round trip by taps. A tap between close places
// zooms in instead of picking one; the test then taps again. Screenshots go to
// test-results/phone/.

import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'de-DE',
});

const SHOTS = 'test-results/phone';

interface Place {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

/** The places of the puzzle at their screen positions (CSS px). */
function places(page: Page): Promise<Place[]> {
  return page.$$eval('g.play-place', (gs) =>
    gs.map((g) => {
      const c = g.querySelector('circle')!.getBoundingClientRect();
      const name = g.querySelector('title')!.textContent ?? '';
      return { name, x: c.x + c.width / 2, y: c.y + c.height / 2 };
    }),
  );
}

/** A short round trip through the points (nearest neighbour, then 2-opt), as indices. */
function shortTour(points: readonly Place[]): number[] {
  const d = (a: number, b: number) =>
    Math.hypot(points[a]!.x - points[b]!.x, points[a]!.y - points[b]!.y);
  const tour = [0];
  const left = new Set(points.keys());
  left.delete(0);
  while (left.size > 0) {
    const last = tour.at(-1)!;
    const next = [...left].reduce((a, b) => (d(last, a) <= d(last, b) ? a : b));
    tour.push(next);
    left.delete(next);
  }
  const n = tour.length;
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 2; j < n; j++) {
        const [a, b, c, e] = [tour[i]!, tour[i + 1]!, tour[j]!, tour[(j + 1) % n]!];
        if (a === e) continue;
        if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 1e-9) {
          tour.splice(i + 1, j - i, ...tour.slice(i + 1, j + 1).reverse());
          improved = true;
        }
      }
  }
  return tour;
}

/** What a tap may change: the view, and the trip (visited places and the drawn path). */
function state(page: Page) {
  return page.evaluate(() => ({
    viewBox: document.querySelector('.play-board svg')!.getAttribute('viewBox'),
    trip: [
      ...[...document.querySelectorAll('g.play-place')].map((g) => g.getAttribute('class')),
      document.querySelector('.play-board .play-path')?.getAttribute('d'),
    ].join('|'),
  }));
}

/**
 * Taps a place like a finger would. A place off screen or under a control brings back the
 * whole map (or is dragged to the middle); a tap that zooms in (two places under the finger)
 * is repeated at the place's new position. Returns how often the map zoomed in.
 */
async function tapPlace(page: Page, name: string, fitted: string | null): Promise<number> {
  let zooms = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await state(page);
    const p = (await places(page)).find((q) => q.name === name)!;
    const free = await page.evaluate(
      ({ x, y }) =>
        x > 4 &&
        y > 4 &&
        x < innerWidth - 4 &&
        y < innerHeight - 4 &&
        document.elementFromPoint(x, y)?.closest('.play-board svg') != null,
      { x: p.x, y: p.y },
    );
    if (!free) {
      const fit = page.getByRole('button', { name: 'Alle Orte zeigen' });
      if (before.viewBox !== fitted) await fit.click();
      else {
        const box = (await page.locator('.play-board svg').boundingBox())!;
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
        await page.mouse.up();
      }
      continue;
    }
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(80);
    const after = await state(page);
    if (after.viewBox !== before.viewBox) zooms++;
    else if (after.trip !== before.trip) return zooms;
  }
  throw new Error(`could not tap ${name}`);
}

test('a whole round trip by taps on a phone', async ({ page }) => {
  await page.goto('#p/exzellenzstrategie-2027-37');
  const board = page.locator('.play-board svg');
  await expect(page.locator('g.play-place')).toHaveCount(37);

  // The phone layout: no sideways scrolling, the board near the top, the status bar in view.
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    boardTop: document.querySelector('.play-board')!.getBoundingClientRect().top,
    statusBottom: document.querySelector('.play-status')!.getBoundingClientRect().bottom,
    folded: document.querySelector('details.board-title') !== null,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(390);
  expect(layout.boardTop).toBeLessThan(120);
  expect(layout.statusBottom).toBeLessThanOrEqual(844);
  expect(layout.folded).toBe(true);
  await expect(page.getByText(/^Tippe die Orte/)).toHaveCount(1);
  const fitted = await board.getAttribute('viewBox');
  await page.screenshot({ path: `${SHOTS}/1-start.jpg`, quality: 80 });

  const start = await places(page);
  const order = shortTour(start).map((i) => start[i]!.name);
  const status = page.locator('.play-status');
  let zooms = 0;
  for (const [k, name] of order.entries()) {
    const z = await tapPlace(page, name, fitted);
    if (z > 0 && zooms === 0) {
      // The first ambiguous tap: show the zoomed map with the place just picked.
      await page.screenshot({ path: `${SHOTS}/2-zoomed.jpg`, quality: 80 });
    }
    zooms += z;
    await expect(status).toContainText(`${k + 1}/37`);
  }
  await tapPlace(page, order[0]!, fitted);

  // The closed trip is judged against the shortest one.
  await expect(status.locator('.result')).toBeVisible({ timeout: 60_000 });
  const result = (await status.locator('.result').textContent()) ?? '';
  expect(result).toMatch(/^(✓|\+)/);
  expect(zooms).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Alle Orte zeigen' }).click();
  await page.screenshot({ path: `${SHOTS}/3-closed.jpg`, quality: 80 });
  console.log(`37 places tapped, ${zooms} taps zoomed in, result ${result}`);
});
