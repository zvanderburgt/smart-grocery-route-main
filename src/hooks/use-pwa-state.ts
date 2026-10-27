import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export interface PWAStateReturn {
  isOnline: boolean;
  serviceWorkerReady: boolean;
  pwaStatusLabel: string;
}

// The on-device OCR model used to be cached here. Drop it once per client so
// existing installs reclaim the disk space the removed download already took.
const OCR_CACHE_PURGED_KEY = "ocr-model-cache-purged";

function purgeLegacyOCRModelCache(): void {
  try {
    if (typeof caches === "undefined") return;
    if (window.localStorage.getItem(OCR_CACHE_PURGED_KEY) === "1") return;
    void caches.delete("ocr-model-cache").catch(() => {});
    window.localStorage.setItem(OCR_CACHE_PURGED_KEY, "1");
  } catch {
    // caches/localStorage may be unavailable; nothing to reclaim then
  }
}

/**
 * Manages PWA lifecycle state: online/offline, service worker readiness,
 * and update-available toasts.
 * Encapsulates all PWA-related effects from App.tsx.
 */
export function usePWAState(): PWAStateReturn {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const hasShownOfflineReadyToast = useRef(false);
  const hasShownUpdateToast = useRef(false);

  // One-time cleanup of the legacy on-device OCR model cache
  useEffect(() => {
    purgeLegacyOCRModelCache();
  }, []);

  // Online/offline and service-worker readiness
  useEffect(() => {
    const syncPwaState = () => {
      setServiceWorkerReady(Boolean(navigator.serviceWorker?.controller));
      setIsOnline(navigator.onLine);
    };

    const onUpdateReady = () => setUpdateReady(true);

    const onOfflineReady = () => {
      syncPwaState();
      if (!hasShownOfflineReadyToast.current) {
        hasShownOfflineReadyToast.current = true;
        toast.success("Offline mode is ready");
      }
    };

    syncPwaState();
    window.addEventListener("online", syncPwaState);
    window.addEventListener("offline", syncPwaState);
    window.addEventListener("pwa-update-ready", onUpdateReady);
    window.addEventListener("pwa-offline-ready", onOfflineReady);
    navigator.serviceWorker?.addEventListener("controllerchange", syncPwaState);

    return () => {
      window.removeEventListener("online", syncPwaState);
      window.removeEventListener("offline", syncPwaState);
      window.removeEventListener("pwa-update-ready", onUpdateReady);
      window.removeEventListener("pwa-offline-ready", onOfflineReady);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        syncPwaState,
      );
    };
  }, []);

  // Show update-available toast once, with a refresh action
  useEffect(() => {
    if (!updateReady || hasShownUpdateToast.current) return;
    hasShownUpdateToast.current = true;
    toast.info("Update available", {
      description: "A new version is ready to install.",
      action: {
        label: "Refresh",
        onClick: () =>
          window.dispatchEvent(new CustomEvent("pwa-apply-update")),
      },
      duration: 12000,
    });
  }, [updateReady]);

  const pwaStatusLabel = serviceWorkerReady
    ? "Offline ready"
    : "Preparing offline";

  return {
    isOnline,
    serviceWorkerReady,
    pwaStatusLabel,
  };
}
