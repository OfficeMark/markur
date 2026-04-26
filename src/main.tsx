import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Register the service worker. autoUpdate means new builds activate without
// a user prompt; we just reload silently when one's ready. The registration
// is best-effort — if it fails (e.g. no SW support) we keep going without
// the PWA layer.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      // Surface a non-blocking refresh once a new SW takes control. We avoid
      // doing this on first install (no controller yet).
      if (registration && navigator.serviceWorker.controller) {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'activated') {
              window.location.reload();
            }
          });
        });
      }
    },
  });
}
