import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app.css';
import { openShortLink } from './documents';
import { kioskFreeNames, kioskScreen, kioskTable } from './kiosk';
import { useStore } from './store';
import { registerServiceWorker } from './update';

// Event mode (#kiosk, #kiosk/scores, ?names=free, ?table=1): at the start and whenever the address
// changes. Inside it the page stays there (roadmap 9.12): a step back or an address changed
// to another part of the app returns to the booth's address; only loading the page without
// #kiosk leaves it. A short play link (#p/<id>) entered later opens its puzzle.
let kioskHash: string | null = null;
const enterKiosk = (hash: string) => {
  if (!kioskHash) history.pushState(null, '', hash); // a step back stays on this page
  kioskHash = hash;
  useStore.setState({
    kiosk: kioskScreen(hash),
    kioskFreeNames: kioskFreeNames(hash),
    kioskTable: kioskTable(hash),
  });
};
if (kioskScreen(window.location.hash)) enterKiosk(window.location.hash);
window.addEventListener('popstate', () => {
  // Keep an entry to step back to, so that "back" never leaves the booth.
  if (kioskHash) history.pushState(null, '', kioskHash);
});
window.addEventListener('hashchange', () => {
  const hash = window.location.hash;
  if (kioskHash) {
    if (hash === kioskHash) return;
    if (kioskScreen(hash)) enterKiosk(hash);
    else history.replaceState(null, '', kioskHash);
    return;
  }
  if (kioskScreen(hash)) {
    enterKiosk(hash);
    return;
  }
  if (useStore.getState().country) openShortLink(hash);
});

// Offline after the first visit, updates where a reload loses nothing (roadmap 9.17).
registerServiceWorker();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
