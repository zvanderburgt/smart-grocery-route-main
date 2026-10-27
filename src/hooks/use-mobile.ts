import { useEffect, useState } from "react";

// Lower breakpoint for better detection on modern high-resolution phones
const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const checkIsMobile = () => {
      // Primary check: viewport width
      const widthMatch = window.innerWidth < MOBILE_BREAKPOINT;

      // Secondary check: touch capability (most reliable for actual mobile devices)
      const touchCapable = window.matchMedia(
        "(hover: none) and (pointer: coarse)",
      ).matches;

      // Tertiary check: aspect ratio (mobile devices typically have portrait-ish aspect ratios)
      const mobileAspectRatio = window.matchMedia(
        "(max-aspect-ratio: 1.2)",
      ).matches;

      // Determine if mobile: any of the above indicators suggest mobile
      const result = widthMatch || touchCapable || mobileAspectRatio;

      setIsMobile(result);
    };

    // Initial check
    checkIsMobile();

    // Listen for orientation and resize changes
    const resizeObserver = new ResizeObserver(checkIsMobile);
    resizeObserver.observe(document.documentElement);

    window.addEventListener("orientationchange", checkIsMobile);
    window.addEventListener("resize", checkIsMobile);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("orientationchange", checkIsMobile);
      window.removeEventListener("resize", checkIsMobile);
    };
  }, []);

  return !!isMobile;
}
