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

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
   </ErrorBoundary>
)
