import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app.css';
import { openShortLink } from './documents';
import { kioskScreen } from './kiosk';
import { useStore } from './store';

// Event mode (#kiosk, #kiosk/scores): at the start and whenever the address changes. A short
// play link (#p/<id>) entered later opens its puzzle too.
useStore.setState({ kiosk: kioskScreen(window.location.hash) });
window.addEventListener('hashchange', () => {
  const screen = kioskScreen(window.location.hash);
  if (screen || useStore.getState().kiosk) useStore.setState({ kiosk: screen });
  if (useStore.getState().country) openShortLink(window.location.hash);
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
