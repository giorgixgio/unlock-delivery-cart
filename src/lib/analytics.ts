export function trackEvent(name: string, props: Record<string, any> = {}, flush = false) {
  const ph = (window as any).posthog;
  if (!ph) return;
  ph.capture(name, {
    ...props,
    timestamp: Date.now(),
  });
  if (flush && typeof ph.flush === "function") {
    try { ph.flush(); } catch {}
  }
}
