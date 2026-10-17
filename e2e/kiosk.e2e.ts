// The event mode at the booth (roadmap 9.12): names from a list instead of free text, staff
// remove a leaderboard entry by a long press and a confirmation, and no way out of the kiosk:
// every visible button is clicked on every screen, plus the back button, keys and an address
// changed to another part of the app.

import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 860 }, locale: 'de-DE' });
test.setTimeout(600_000);

/** A fresh page load of an address (a hash change alone would keep the page). */
async function load(page: Page, hash: string) {
  await page.goto('about:blank');
  await page.goto(`/${hash}`);
  await expect(page.locator('.kiosk')).toHaveCount(1);
}

/** Nothing outside the event mode: no gallery, designer, export, links or other addresses. */
async function inKiosk(page: Page, step: string) {
  await expect(page.locator('.kiosk'), step).toHaveCount(1);
  await expect(page.locator('.gallery-page, .panel.params'), step).toHaveCount(0);
  await expect(page.locator('a[href]'), step).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /designer|galerie|sammlung|export|plakat/i }),
    step,
  ).toHaveCount(0);
  expect(new URL(page.url()).hash, step).toMatch(/^#kiosk/);
}

/** Names of the enabled, visible buttons (in document order). */
async function buttons(page: Page): Promise<string[]> {
  return page
    .locator('button:visible:enabled')
    .evaluateAll((list) =>
      list.map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
    );
}

async function openPuzzle(page: Page, title: string) {
  await page.locator('.kiosk-card', { hasText: title }).click();
  await expect(page.locator('.kiosk-play')).toHaveCount(1);
  await expect(page.locator('.kiosk-name strong, .kiosk input[type=text]')).toHaveCount(1);
}

const PUZZLES = ['Ruhrgebiet', 'In 80 Tagen um die Welt', 'Exzellenzuniversitäten ab 2027'];

test('names come from a list; free text only with ?names=free', async ({ page }) => {
  await load(page, '#kiosk');
  await openPuzzle(page, 'Ruhrgebiet');
  await expect(page.locator('.kiosk input[type=text]')).toHaveCount(0);
  const name = page.locator('.kiosk-name strong');
  const first = await name.textContent();
  expect(first).toMatch(/^\p{Lu}\p{Ll}+ \d{1,2}$/u);
  await page.getByRole('button', { name: 'Anderer Name' }).click();
  // Another draw (a repeat of the same name is possible but unlikely; try a few times).
  for (let i = 0; i < 5 && (await name.textContent()) === first; i++)
    await page.getByRole('button', { name: 'Anderer Name' }).click();
  expect(await name.textContent()).not.toBe(first);
  await page.getByRole('button', { name: 'Nächste Person' }).click();
  await expect(name).toHaveText(/^\p{Lu}\p{Ll}+ \d{1,2}$/u);

  await load(page, '#kiosk?names=free');
  await openPuzzle(page, 'Ruhrgebiet');
  await expect(page.locator('.kiosk input[type=text]')).toHaveCount(1);
  await expect(page.locator('.kiosk-name')).toHaveCount(0);
});

test('staff remove an entry by a long press and a confirmation', async ({ page }) => {
  await load(page, '#kiosk/scores');
  await page.evaluate(() => {
    const date = new Date().toISOString().slice(0, 10);
    const entry = (name: string, ms: number) => ({
      name,
      excess: 0,
      measure: 'euclidean',
      ms,
      revealed: false,
      date,
      order: [0, 1, 2],
    });
    localStorage.setItem(
      'tsp-boards.scores.v1',
      JSON.stringify({ 'ruhrgebiet-11': [entry('Igel 3', 61_000), entry('Otter 8', 75_000)] }),
    );
  });
  await page.reload();
  const row = page.locator('.daily-scores li', { hasText: 'Igel 3' });
  await expect(row).toHaveCount(1);

  // A short press does nothing.
  await row.click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  // Shift+Delete on the focused entry asks; "Abbrechen" keeps it.
  await row.focus();
  await page.keyboard.press('Shift+Delete');
  await expect(page.getByRole('alertdialog')).toContainText('„Igel 3“');
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(row).toHaveCount(1);
  // A long press asks; "Entfernen" removes it, also from the stored list.
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await expect(page.getByRole('alertdialog')).toContainText('„Igel 3“');
  await page.getByRole('button', { name: 'Entfernen' }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('.daily-scores li', { hasText: 'Otter 8' })).toHaveCount(1);
  const stored = await page.evaluate(() => localStorage.getItem('tsp-boards.scores.v1') ?? '');
  expect(stored).not.toContain('Igel 3');
  expect(stored).toContain('Otter 8');
});

test('every button, the back button, keys and other addresses stay inside the kiosk', async ({
  page,
}) => {
  const clicked: string[] = [];
  const clickEach = async (enter: () => Promise<void>, screen: string) => {
    await enter();
    const names = await buttons(page);
    for (let i = 0; i < names.length; i++) {
      await enter();
      const button = page.locator('button:visible:enabled').nth(i);
      if ((await button.count()) === 0) continue;
      const label = `${screen} → ${names[i]}`;
      await button.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(150);
      await inKiosk(page, label);
      clicked.push(label);
    }
  };

  // The start screen and the leaderboards.
  await clickEach(() => load(page, '#kiosk'), 'start');
  await clickEach(() => load(page, '#kiosk/scores'), 'scores');
  // A game of each kind: on screen, on the globe, on the board; then with the solution shown.
  for (const title of PUZZLES) {
    const play = async () => {
      await load(page, '#kiosk');
      await openPuzzle(page, title);
    };
    await clickEach(play, title);
    await clickEach(async () => {
      await play();
      await page.getByRole('button', { name: 'Lösung zeigen' }).click();
      await page.getByRole('button', { name: /Lösung wirklich zeigen|wirklich/i }).click();
      await expect(page.locator('.play-result, .legend')).not.toHaveCount(0);
    }, `${title} (solution shown)`);
  }

  // Back, keys and another address keep the game.
  await load(page, '#kiosk');
  await openPuzzle(page, 'Ruhrgebiet');
  await page.goBack();
  await page.waitForTimeout(300);
  await inKiosk(page, 'back');
  await expect(page.locator('.kiosk-play')).toHaveCount(1);
  await page.goBack();
  await page.waitForTimeout(300);
  await inKiosk(page, 'back twice');
  for (const key of ['Escape', 'Backspace', 'Alt+ArrowLeft', 'Alt+Home', 'F5']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    await inKiosk(page, key);
  }
  await page.evaluate(() => {
    window.location.hash = '#r=DE&n=40';
  });
  await page.waitForTimeout(300);
  await inKiosk(page, 'another address');
  console.log(`${clicked.length} buttons clicked, all inside the kiosk`);
  expect(clicked.length).toBeGreaterThan(40);
});
