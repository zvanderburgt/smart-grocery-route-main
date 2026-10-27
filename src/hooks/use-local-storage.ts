import { useState, useEffect, useCallback } from "react";

/**
 * A drop-in replacement for @github/spark's useKV hook that persists data
 * to localStorage instead of the Spark KV service. This works offline and
 * survives page reloads without any server/auth requirements.
 *
 * Returns [value, setValue, deleteValue] — same tuple shape as useKV.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue?: T,
): readonly [
  T | undefined,
  (newValue: T | ((oldValue?: T) => T)) => void,
  () => void,
] {
  const [storedValue, setStoredValue] = useState<T | undefined>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      return JSON.parse(item) as T;
    } catch {
      return initialValue;
    }
  });

  // Sync to localStorage whenever the value changes
  const setValue = useCallback(
    (newValue: T | ((oldValue?: T) => T)) => {
      setStoredValue((prev) => {
        const resolved =
          typeof newValue === "function"
            ? (newValue as (oldValue?: T) => T)(prev)
            : newValue;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // localStorage might be full or unavailable — fail silently
        }
        return resolved;
      });
    },
    [key],
  );

  const deleteValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setStoredValue(undefined);
  }, [key]);

  // Listen for changes made in other tabs/windows
  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key !== key) return;
      if (e.newValue === null) {
        setStoredValue(undefined);
      } else {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch {
          // ignore malformed values
        }
      }
    };
    window.addEventListener("storage", handleStorageEvent);
    return () => window.removeEventListener("storage", handleStorageEvent);
  }, [key]);

  return [storedValue, setValue, deleteValue] as const;
}
