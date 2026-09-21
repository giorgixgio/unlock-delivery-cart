# Roadmap — Courier section

- [ ] Migration: shipment columns (sender/receiver/dates/comment/is_return/derived_state), batch coverage+conflicts, courier_status_map, courier_alert_settings, RLS+grants
- [ ] Retro-remap existing 3,846 shipments into derived_state
- [ ] Fix stuck Aug 7 batch (status processing -> completed with real counts)
- [ ] import-courier: dry_run preview, chunked import, crash-safe finalization, status-map driven states, return linking by phone+items+date, order sync
- [ ] Import UI: preview counts, conflicts, coverage date ranges, "only from date" filter, progress
- [ ] Statistics page (delivery rate + resolved share, auto vs operator, product, city, value band, item count, weekly)
- [ ] Physical recovery metric (collected / on the way / not registered) overall + per product
- [ ] Alerts page + configurable thresholds + nav badge
- [ ] Restock view
- [ ] Nav group + routes
- [ ] Test: same file twice = 0 new, 0 changes; preview shows last-upload range
