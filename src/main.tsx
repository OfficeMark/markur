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

// Service worker auto-update (M10c).
//
// vite-plugin-pwa registers the SW with `registerType: 'autoUpdate'`. When a
// new build hits Netlify, the SW activates and takes over — but the user's
// open tab still serves the *old* JS until they reload. We bridge that gap
// here: as soon as `controllerchange` fires (a new SW assumed control),
// reload once. The `reloading` guard prevents Chrome's quirky double-fire.
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  registerSW({
    immediate: true,
    onNeedRefresh() {
      // autoUpdate flow already calls skipWaiting under the hood; the
      // controllerchange listener above will catch it. No prompt UI here.
    },
    onOfflineReady() {
      // Service worker installed for the first time; the app is now
      // available offline. No notification needed.
    },
  });
}
