// Persistent customer info store — uses cookie + localStorage for maximum mobile survival

const STORAGE_KEY = "lb_customer";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days

export interface SavedCustomer {
  name: string;
  phone: string;
  region: string;
  address: string;
  savedAt: number; // timestamp
}

/** Save customer info to all layers */
export function saveCustomerInfo(data: Omit<SavedCustomer, "savedAt">) {
  // Don't save if all fields are empty
  if (!data.name && !data.phone && !data.region && !data.address) return;

  const payload: SavedCustomer = { ...data, savedAt: Date.now() };
  const json = JSON.stringify(payload);

  // localStorage
  try { localStorage.setItem(STORAGE_KEY, json); } catch {}
  // sessionStorage
  try { sessionStorage.setItem(STORAGE_KEY, json); } catch {}
  // cookie (most persistent on iOS/Android)
  try {
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(json)};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
  } catch {}
}

/** Load customer info from whichever layer survived */
export function loadCustomerInfo(): SavedCustomer | null {
  const fromLocal = safeGet(localStorage);
  const fromSession = safeGet(sessionStorage);
  const fromCookie = getCookieValue();

  // Pick the most recent one
  const candidates = [fromLocal, fromSession, fromCookie].filter(Boolean) as SavedCustomer[];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.savedAt - a.savedAt);
  const best = candidates[0];

  // Re-sync to all layers
  const json = JSON.stringify(best);
  try { localStorage.setItem(STORAGE_KEY, json); } catch {}
  try { sessionStorage.setItem(STORAGE_KEY, json); } catch {}
  try {
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(json)};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
  } catch {}

  return best;
}

/** Clear customer info from all layers (after order placed) */
export function clearCustomerInfo() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  try {
    document.cookie = `${STORAGE_KEY}=;path=/;max-age=0;SameSite=Lax`;
  } catch {}
}

/** Check if we have any saved customer data with at least name or phone */
export function hasSavedCustomer(): boolean {
  const data = loadCustomerInfo();
  return !!(data && (data.name || data.phone));
}

// ---- helpers ----

function safeGet(storage: Storage): SavedCustomer | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedCustomer;
  } catch {
    return null;
  }
}

function getCookieValue(): SavedCustomer | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${STORAGE_KEY}=([^;]*)`));
    if (!match) return null;
    return JSON.parse(decodeURIComponent(match[1])) as SavedCustomer;
  } catch {
    return null;
  }
}
