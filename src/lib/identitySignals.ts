// Generate a persistent browser fingerprint hash stored in localStorage
export function getCookieIdHash(): string {
  const KEY = "lb_cid";
  let cid = localStorage.getItem(KEY);
  if (!cid) {
    // Simple hash from timestamp + random
    const raw = `${Date.now()}-${Math.random().toString(36).slice(2)}-${navigator.userAgent}`;
    cid = simpleHash(raw);
    localStorage.setItem(KEY, cid);
  }
  return cid;
}

export function getUserAgent(): string {
  return navigator.userAgent || "";
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
