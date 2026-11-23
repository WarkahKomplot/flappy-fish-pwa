import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Register PWA Service Worker
if ('serviceWorker' in navigator && (import.meta.env.PROD || process.env.NODE_ENV === 'production')) {
  window.addEventListener('load', () => {
    // ?v=N busts the HTTP cache of sw.js itself. CACHE_NAME inside sw.js is the
    // single knob that must change per deploy of cached shell content.
    const swUrl = `${import.meta.env.BASE_URL}sw.js?v=12`;
    // When a new SW takes control (skipWaiting + clients.claim), reload once so
    // the fresh shell is picked up without a manual refresh. The flag guards
    // against reload loops.
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register(swUrl)
      .then(reg => {
        reg.update();
        console.log('Flappy Fish PWA Service Worker registered:', reg.scope);
      })
      .catch(err => {
        console.warn('Flappy Fish Service Worker registration failed:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
