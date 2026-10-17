// Offline use and updates (roadmap 9.17): the service worker (vite-plugin-pwa, vite.config.ts)
// precaches the app, so the Pages site and the booth's #kiosk work offline after the first
// visit. A new version installs in the background and waits; the page keeps running the old
// one (still served by the old service worker, so no file of it goes missing) until the app
// switches over where a reload loses nothing: the gallery, or the kiosk's start screen and
// leaderboard, never during a game. Elsewhere a button offers the reload.

import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { useStore } from './store';

/** How often a page that stays open (the booth) asks the server for a new version. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

interface UpdateState {
  /** Activates the waiting version and reloads the page; null while no new version waits. */
  readonly install: (() => void) | null;
}

export const useUpdate = create<UpdateState>()(() => ({ install: null }));

/** Where a reload loses nothing: the gallery outside the kiosk, or the kiosk between games. */
export function canReloadNow(state: {
  readonly page: string;
  readonly kiosk: 'start' | 'play' | 'scores' | null;
}): boolean {
  return state.kiosk === null ? state.page === 'gallery' : state.kiosk !== 'play';
}

/** Registers the service worker (production builds only) and checks for updates hourly. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const activate = registerSW({
    onNeedRefresh: () => useUpdate.setState({ install: () => void activate(true) }),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      window.setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => undefined);
      }, UPDATE_CHECK_MS);
    },
  });
  // Switch over as soon as the app is somewhere a reload loses nothing.
  const check = () => {
    const { install } = useUpdate.getState();
    if (!install || !canReloadNow(useStore.getState())) return;
    useUpdate.setState({ install: null });
    install();
  };
  useUpdate.subscribe(check);
  useStore.subscribe(check);
}
