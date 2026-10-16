// Event mode for a booth (roadmap 9.4): which screen #kiosk opens, the levels and the reset.

/** Back to the start screen after this long without a touch, click or key. */
export const INACTIVITY_MS = 120_000;

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
    ids: ['exzellenzstrategie-2027', 'deutschland-40', 'welt-30', 'europa-30'],
  },
];

/** Whether the page was opened in event mode (#kiosk or #kiosk/scores). */
export function kioskScreen(hash: string): 'start' | 'scores' | null {
  if (hash === '#kiosk/scores') return 'scores';
  return hash === '#kiosk' || hash.startsWith('#kiosk/') ? 'start' : null;
}
