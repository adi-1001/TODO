/**
 * A unique id. crypto.randomUUID exists only in secure contexts (https://, localhost, the
 * Android app); over http:// LAN addresses the fallback is used. Every id in the app comes from
 * here.
 */
export function generateId(): string {
  return newId();
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Small deterministic PRNG (mulberry32) for seed data. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEVICE_KEY = 'study-space:device-id';
let deviceId: string | null = null;

/**
 * A short random id for this browser or app install, kept in localStorage. Question logs use
 * it so that each record has a single writer.
 */
export function getDeviceId(): string {
  if (deviceId) return deviceId;
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_KEY);
  } catch {
    /* no storage */
  }
  if (!id || !/^[a-z0-9]{6,16}$/.test(id)) {
    id = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      /* the id lasts for this session only */
    }
  }
  deviceId = id;
  return id;
}

/** Positive 31-bit hash, for native notification ids. */
export function hash31(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}
