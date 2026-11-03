import { lazy, type ComponentType } from "react";

/** Build id baked in by vite (`define`); "dev" locally. */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /error loading dynamically imported module/i,
];
export function isChunkError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : (err as any)?.message || (err as any)?.name || String(err ?? "");
  return CHUNK_PATTERNS.some((r) => r.test(msg));
}
/** Network / stale-version symptoms that a page refresh usually fixes. */
export function isRefreshableError(err: unknown): boolean {
  if (isChunkError(err)) return true;
  const msg = typeof err === "string" ? err : (err as any)?.message || String(err ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|could not find the function|schema cache/i.test(msg);
}

const RELOAD_KEY = "deploy_guard_reload_at";
export const RELOAD_GUARD_MS = 30_000;
/** True when a reload is allowed (no reload in the last 30 s). */
export function canReload(lastAt: number | null, now: number): boolean {
  return !lastAt || now - lastAt > RELOAD_GUARD_MS;
}
export function reloadOnce(): boolean {
  let last: number | null = null;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || null; } catch { /* ignore */ }
  if (!canReload(last, Date.now())) return false;
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignore */ }
  window.location.reload();
  return true;
}

/** lazy() that retries the import once, then reloads the page once. */
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try { return await factory(); }
    catch (e) {
      try { await new Promise((r) => setTimeout(r, 800)); return await factory(); }
      catch (e2) { if (isChunkError(e2) && reloadOnce()) return new Promise<never>(() => {}); throw e2; }
    }
  });
}

let installed = false;
export function installChunkRecovery() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => { if (isChunkError(ev.error ?? ev.message)) reloadOnce(); });
  window.addEventListener("unhandledrejection", (ev) => { if (isChunkError(ev.reason)) reloadOnce(); });
  window.addEventListener("vite:preloadError", (ev: any) => { ev.preventDefault?.(); reloadOnce(); });
}

// ---- "busy" registry: never auto-reload while someone is mid-order or mid-bulk-operation ----
type Kind = "order" | "hard";
const busy = new Map<string, Kind>();
let updateReady = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const subscribeDeploy = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const deployState = () => ({ updateReady, busy: busy.size > 0, hardBusy: [...busy.values()].includes("hard") });

/** Decide what to do when a new version is seen. */
export function decideOnUpdate(s: { busyOrder: boolean; hardBusy: boolean }): "reload" | "wait" {
  return s.busyOrder || s.hardBusy ? "wait" : "reload";
}
function tryApply() {
  if (!updateReady) return;
  const st = deployState();
  if (decideOnUpdate({ busyOrder: st.busy, hardBusy: st.hardBusy }) === "reload") reloadOnce();
}
/** kind "order" = open order card / pop-up / unsaved form; "hard" = Onway send, bulk op (never reload). */
export function setDeployBusy(key: string, on: boolean, kind: Kind = "order") {
  const had = busy.has(key);
  if (on) busy.set(key, kind); else busy.delete(key);
  if (had !== on) emit();
  if (!on) tryApply();
}
/** Call after an outcome is saved: reloads now if a new version is waiting and nothing else is busy. */
export function notifyOutcomeDone() { tryApply(); }
export function refreshNow() {
  if (deployState().hardBusy) return;
  try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
  window.location.reload();
}

let watching = false;
export function startVersionWatch() {
  if (watching || typeof window === "undefined" || APP_VERSION === "dev") return;
  watching = true;
  const check = async () => {
    if (updateReady) return tryApply();
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.version && j.version !== APP_VERSION) { updateReady = true; emit(); tryApply(); }
    } catch { /* offline — try later */ }
  };
  setInterval(check, 60_000);
  window.addEventListener("focus", () => { void check(); });
  void check();
}
