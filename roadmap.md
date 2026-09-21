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
