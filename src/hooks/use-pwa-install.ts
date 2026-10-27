import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PWAInstallState {
  /** True if the browser has a native install prompt ready */
  canInstall: boolean;
  /** True if running as installed PWA (standalone/fullscreen mode) */
  isStandalone: boolean;
  /** True if running on iOS (requires manual Add to Home Screen) */
  isIOS: boolean;
  /** True if the banner was dismissed this session */
  isDismissed: boolean;
  /** Trigger the native install prompt (Android/Chrome/Edge) */
  triggerInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  /** Dismiss the install banner for this session */
  dismiss: () => void;
}

function detectStandalone(): boolean {
  // iOS Safari
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true)
    return true;
  // Chrome/Edge/other
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  return false;
}

function detectIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !/crios/i.test(ua);
}

const DISMISS_KEY = "pwa-install-dismissed-until";

function isPermanentlyDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch {
    return false;
  }
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone] = useState(() => detectStandalone());
  const [isIOS] = useState(() => detectIOS());
  const [isDismissed, setIsDismissed] = useState(() =>
    isPermanentlyDismissed(),
  );

  useEffect(() => {
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const onInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isStandalone]);

  const triggerInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | "unavailable"
  > => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return result.outcome;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    // Dismiss for 7 days
    try {
      const dismissUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(dismissUntil));
    } catch {
      // ignore storage errors
    }
    setIsDismissed(true);
  }, []);

  const canInstall =
    !isStandalone && !isDismissed && (!!deferredPrompt || isIOS);

  return {
    canInstall,
    isStandalone,
    isIOS,
    isDismissed,
    triggerInstall,
    dismiss,
  };
}
