// Media queries as React state (roadmap 9.10: a phone layout for playing on the go).

import { useSyncExternalStore } from 'react';

/** Narrow screens get the phone layout of the play view. */
export const PHONE = '(max-width: 600px)';
/** A finger, not a mouse: "Tippe" instead of "Klicke", and taps near several places zoom in. */
export const TOUCH = '(pointer: coarse)';

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (changed) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', changed);
      return () => list.removeEventListener('change', changed);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
