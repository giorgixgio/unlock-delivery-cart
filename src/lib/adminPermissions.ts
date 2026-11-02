/**
 * Route-level permissions per admin role.
 * Roles not listed here (admin, operator) get full access.
 */
export const SCANNER_PATHS = [
  "/admin/fast-check",
  "/admin/product-scan",
  "/admin/photo-review",
  "/admin/scan-history",
  "/admin/live-scans",
  "/admin/unidentified-items",
  "/admin/inventory-audit",
  "/admin/sku-health",
  "/admin/bin-locations",
];

export const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  warehouse: ["/admin/products", "/admin/shipping", ...SCANNER_PATHS],
  scanner: SCANNER_PATHS,
};

/** Landing page for a restricted role (first allowed path). */
export function roleHomePath(role: string | null | undefined): string {
  const allowed = role ? ROLE_ALLOWED_PATHS[role] : undefined;
  return allowed?.[0] ?? "/admin/orders";
}

/** True when the role may open this pathname. */
export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  const allowed = role ? ROLE_ALLOWED_PATHS[role] : undefined;
  if (!allowed) return true;
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Call Queue master switch: plain operators (not admins, not managers) work only from the queue.
 * Returns false whenever the switch is off, so routing is exactly as before.
 */
export function isQueueOnlyOperator(
  role: string | null | undefined,
  email: string | null | undefined,
  settings: { operators_use_queue?: boolean; manager_emails?: string[] } | null | undefined,
): boolean {
  if (!settings?.operators_use_queue || role !== "operator") return false;
  const e = (email || "").toLowerCase();
  return !(settings.manager_emails || []).some((m) => m.toLowerCase() === e);
}

export const CALL_QUEUE_PATH = "/admin/call-queue";

/** Redirect target for queue-only operators: the orders list goes to the queue; single orders stay open. */
export function queueOnlyRedirect(pathname: string, queueOnly: boolean): string | null {
  if (!queueOnly) return null;
  const p = pathname.replace(/\/+$/, "");
  return p === "/admin/orders" || p === "/admin" ? CALL_QUEUE_PATH : null;
}
