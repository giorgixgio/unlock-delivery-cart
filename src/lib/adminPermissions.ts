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
  "/admin/bin-locations",
];

export const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  warehouse: ["/admin/products", ...SCANNER_PATHS],
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
