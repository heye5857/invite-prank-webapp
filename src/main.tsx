import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Self-update guard: when a newly deployed service worker takes control of a
// tab that was already running an older bundle, reload once so users never
// keep playing on stale code. Draft state lives in localStorage / the URL, so
// the reload is lossless. (First-ever visit has no controller → no reload.)
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
