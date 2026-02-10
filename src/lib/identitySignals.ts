// Multi-layer persistent browser identity for risk scoring
// Uses cookie (most persistent on mobile) + localStorage + sessionStorage as fallbacks

const CID_KEY = "lb_cid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days (max allowed by browsers)

export function getCookieIdHash(): string {
  // Try to read from any available storage layer
  const fromCookie = getCookie(CID_KEY);
  const fromLocal = safeGetItem(localStorage, CID_KEY);
  const fromSession = safeGetItem(sessionStorage, CID_KEY);

  // Use whichever survived
  const existing = fromCookie || fromLocal || fromSession;

  if (existing) {
    // Re-persist to all layers to keep them in sync
    persistToAllLayers(existing);
    return existing;
  }

  // Generate new identity
  const raw = `${Date.now()}-${Math.random().toString(36).slice(2)}-${navigator.userAgent}-${screen.width}x${screen.height}`;
  const cid = simpleHash(raw);
  persistToAllLayers(cid);
  return cid;
}

export function getUserAgent(): string {
  return navigator.userAgent || "";
}

// ---- Storage helpers ----

function persistToAllLayers(value: string) {
  // 1. Cookie — most persistent on mobile, survives localStorage purges
  setCookie(CID_KEY, value, COOKIE_MAX_AGE);
  // 2. localStorage
  safeSetItem(localStorage, CID_KEY, value);
  // 3. sessionStorage — survives within tab even if localStorage is cleared mid-session
  safeSetItem(sessionStorage, CID_KEY, value);
}

function setCookie(name: string, value: string, maxAge: number) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax`;
  } catch {
    // Cookie access blocked (e.g. some embedded contexts)
  }
}

function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage full or blocked
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
