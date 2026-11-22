import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import "@github/spark/spark"
import { registerSW } from "virtual:pwa-register";

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

const updateSW = registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('pwa-offline-ready'))
    console.info("App is ready to work offline.");
  },
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('pwa-update-ready'))
  },
});

window.addEventListener('pwa-apply-update', () => {
  void updateSW(true)
})

/**
 * A new service worker installs and claims the page, but the document that is
 * already open keeps running the old bundle — which is how a shipped fix sat
 * unseen until the app was reopened enough times (or reinstalled). Reload once
 * when the controller changes on an already-controlled page; on the first visit
 * there is no previous controller and no reason to reload.
 */
const wasControlled = Boolean(navigator.serviceWorker?.controller)
const RELOADED_KEY = 'pwa-controller-reloaded'

navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!wasControlled) return
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === '1') return
    sessionStorage.setItem(RELOADED_KEY, '1')
  } catch {
    // Storage unavailable: a single reload is still the right move.
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
   </ErrorBoundary>
)
