// Event mode for a booth (roadmap 9.4, 9.12): which screen #kiosk opens, the levels, the reset,
// and the players' names (no free text on a public screen).

/** Back to the start screen after this long without a touch, click or key. */
export const INACTIVITY_MS = 120_000;

/** Staff remove a leaderboard entry after pressing it this long (and a confirmation). */
export const LONG_PRESS_MS = 1500;

/** Puzzles per level (curated for a booth; Excellence first). */
export const KIOSK_LEVELS: readonly {
  readonly key: 'easy' | 'medium' | 'hard';
  readonly ids: readonly string[];
}[] = [
  {
    key: 'easy',
    ids: ['exzellenzuniversitaeten-2027-brett', 'ruhrgebiet-11', '80-tage-um-die-welt'],
  },
  {
    key: 'medium',
    ids: [
      'exzellenzstrategie-2027-brett',
      'einmal-um-die-welt',
      'berlin-ortsteile-20',
      'olympia-sommerspiele',
    ],
  },
  {
    key: 'hard',
    ids: ['exzellenzstrategie-2027-37', 'deutschland-40', 'welt-30', 'europa-30', 'welt-pazifik'],
  },
];

/** A table label: letters, digits, spaces and dashes, at most 12 characters. */
const TABLE = /^[\p{L}\p{N} _-]{1,12}$/u;

/**
 * The event mode's address: #kiosk or #kiosk/scores, optionally with ?names=free and a table
 * label ?table=1 (roadmap 9.17: two laptops at the booth, each with its own leaderboard).
 */
function parseKioskHash(
  hash: string,
): { screen: 'start' | 'scores'; free: boolean; table: string | null } | null {
  const m = /^#kiosk(\/[^?]*)?(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const query = new URLSearchParams(m[2] ?? '');
  const table = query.get('table')?.trim() ?? '';
  return {
    screen: m[1] === '/scores' ? 'scores' : 'start',
    free: query.get('names') === 'free',
    table: TABLE.test(table) ? table : null,
  };
}

/** Whether the page was opened in event mode (#kiosk or #kiosk/scores). */
export function kioskScreen(hash: string): 'start' | 'scores' | null {
  return parseKioskHash(hash)?.screen ?? null;
}

/** The booth's table label (#kiosk?table=1, roadmap 9.17), or null. */
export function kioskTable(hash: string): string | null {
  return parseKioskHash(hash)?.table ?? null;
}

/** Free names only with a switch for supervised use (#kiosk?names=free, roadmap 9.12). */
export function kioskFreeNames(hash: string): boolean {
  return parseKioskHash(hash)?.free ?? false;
}

/** Animals for players' names, German and English (the same animal at the same index). */
export const KIOSK_ANIMALS: readonly (readonly [string, string])[] = [
  ['Fuchs', 'Fox'],
  ['Biber', 'Beaver'],
  ['Igel', 'Hedgehog'],
  ['Dachs', 'Badger'],
  ['Otter', 'Otter'],
  ['Eule', 'Owl'],
  ['Luchs', 'Lynx'],
  ['Hase', 'Hare'],
  ['Wal', 'Whale'],
  ['Delfin', 'Dolphin'],
  ['Pinguin', 'Penguin'],
  ['Panda', 'Panda'],
  ['Koala', 'Koala'],
  ['Zebra', 'Zebra'],
  ['Giraffe', 'Giraffe'],
  ['Elefant', 'Elephant'],
  ['Löwe', 'Lion'],
  ['Tiger', 'Tiger'],
  ['Bär', 'Bear'],
  ['Wolf', 'Wolf'],
  ['Adler', 'Eagle'],
  ['Falke', 'Falcon'],
  ['Specht', 'Woodpecker'],
  ['Robbe', 'Seal'],
  ['Hamster', 'Hamster'],
  ['Frosch', 'Frog'],
  ['Lama', 'Llama'],
  ['Kamel', 'Camel'],
  ['Känguru', 'Kangaroo'],
  ['Faultier', 'Sloth'],
  ['Flamingo', 'Flamingo'],
  ['Papagei', 'Parrot'],
];

/**
 * A name for the next player, e.g. "Fuchs 7", not one of `taken` (today's leaderboards) if
 * avoidable.
 */
export function kioskName(
  lang: 'de' | 'en',
  taken: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): string {
  let name = '';
  for (let attempt = 0; attempt < 50; attempt++) {
    const animal = KIOSK_ANIMALS[Math.floor(random() * KIOSK_ANIMALS.length)]!;
    name = `${animal[lang === 'de' ? 0 : 1]} ${1 + Math.floor(random() * 99)}`;
    if (!taken.has(name)) break;
  }
  return name;
}
