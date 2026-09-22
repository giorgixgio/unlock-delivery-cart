# Roadmap — Courier section

- [x] Migration: shipment columns, batch coverage+conflicts, courier_status_map, courier_alert_settings, RLS+grants
- [x] Retro-remap existing 3,846 shipments into derived_state
- [x] Fix stuck Aug 7 batch (now completed, 2,705 history rows counted)
- [x] import-courier: chunked, crash-safe finalize, status-map states, return linking, order sync
- [x] Import UI: preview counts, conflicts, coverage ranges, "only from date", progress
- [x] Statistics page (delivery rate, resolved share, auto vs operator, product, city, value band, item count, weekly)
- [x] Physical recovery metric (collected / on the way / not registered), overall + per product
- [x] Alerts page + thresholds + nav badge
- [x] Restock view
- [x] Statuses config page + nav group + routes
- [x] Unit tests for return detection, comment parsing, recovery rules
- [ ] End-to-end double-upload test — needs a real courier file uploaded through the admin (no admin session available to the agent)
- [x] Shared per-SKU recovery module (src/lib/courierRecovery.ts) used by Restock + admin Products
- [x] Products page: received back / on the way / in progress columns, sorting, totals, tooltips
- [x] Repair legacy courier-to-order links by normalized order number + customer phone; verify Products totals
- [x] Products recovery summary equals the exact return columns on the currently visible product page

# Roadmap — Operator Stats rebuild

- [x] Add unified operator call-outcome event tracking across quick review, order detail, and bulk actions
- [x] Backfill historical call-outcome events idempotently
- [x] Build paginated Tbilisi-time stats data layer and pure calculation engine with tests
- [x] Rebuild Operator Stats into Overview, Operators, Capacity planner, and Day performance tabs
- [ ] Verify Dashboard-aligned day performance, store/operator filters, and mobile layout
