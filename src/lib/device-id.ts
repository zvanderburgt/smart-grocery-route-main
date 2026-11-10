/**
 * Stable per-install identity. Used for the `updatedBy` fallback (so provenance
 * is a real device rather than the string "local") and for deterministic
 * tie-breaks between devices that edited at the same millisecond.
 */

const DEVICE_ID_KEY = 'device-id';

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;

  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const created = `device-${generateId()}`;
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    cached = created;
    return created;
  } catch {
    cached = cached ?? `device-${generateId()}`;
    return cached;
  }
}

function generateId(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Test hook. */
export function __resetDeviceIdCache(): void {
  cached = null;
}
