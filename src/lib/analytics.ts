export function trackEvent(name: string, props: Record<string, any> = {}) {
  const ph = (window as any).posthog;
  if (!ph) return;
  ph.capture(name, {
    ...props,
    timestamp: Date.now(),
  });
}
