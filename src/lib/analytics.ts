export function trackEvent(name: string, props: Record<string, any> = {}, flush = false) {
  const ph = (window as any).posthog;
  if (!ph) return;
  ph.capture(name, {
    ...props,
    ...(window.location.pathname === '/p/mini-camera' ? { landingVariant: 'custom-mini-camera', landing_variant: 'custom-mini-camera' } : {}),
    timestamp: Date.now(),
  });
  if (flush && typeof ph.flush === "function") {
    try { ph.flush(); } catch {}
  }
}
