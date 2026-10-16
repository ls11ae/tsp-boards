import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app.css';
import { kioskScreen } from './kiosk';
import { useStore } from './store';

// Event mode (#kiosk): decided once at the start.
useStore.setState({ kiosk: kioskScreen(window.location.hash) });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
