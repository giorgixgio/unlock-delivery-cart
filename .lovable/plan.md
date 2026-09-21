# Courier hub — extend the existing import into a full "Courier" section

## What already exists (verified)

- Tables: `courier_import_batches`, `courier_shipments`, `courier_status_history`, `courier_import_mappings`, `courier_export_settings`; `orders.courier_status`, `orders.courier_import_batch_id`, `orders.tracking_number`.
- Edge function `import-courier`: admin-only, parses a client-side-parsed payload, header auto-mapping (Georgian aliases + DB mapping table), file-hash dedupe, bulk upsert by tracking, status-history append, writes tracking back to orders by `public_order_number`.
- Pages: `AdminCourierImport`, `AdminCourierAnalytics`, `AdminCourierReturnMatching`, `AdminCourierImportMapping`, all under `/admin` with the existing admin guard.
- Shared labels in `src/lib/courierStatus.ts`.

All of this is reused. Nothing is duplicated or rewritten from scratch.

## Verified problems to fix

1. The Aug 7 batch (3,628 rows) is `processing` with all counters at 0, yet 2,705 history rows carry its id — so it wrote data and then never reached the finalize step (response/timeout), and there is no `failed`/recovery path. Batch finalization must be moved before the long tail of work and made crash-safe.
2. Current mapping can't express the owner's rules: `არ ჩაბარდა` (non-final retry) is stored as FINAL_NOT_DELIVERED (25 rows), `ფილიალიდან გაცემა` is stored as IN_TRANSIT (505 rows), `შეკვეთის გაუქმება` as IN_TRANSIT (2 rows), and direction is guessed from `company_receives` rather than sender/receiver.
3. Sender/receiver, order date, pickup date, and the `კომენტარი` item list are not stored, so returns can't be linked and item-level stats aren't possible.

## Schema changes (additive migrations only)

`courier_shipments` — new nullable columns:
`sender_name`, `receiver_name`, `order_date`, `pickup_date`, `final_status_date`, `comment_raw`, `comment_items jsonb`, `is_return boolean default false`, `status_changed_at timestamptz`, `derived_state text` (new finer state), plus index on `(derived_status, latest_status_date)` and on `phone_normalized`.

`courier_import_batches` — `covered_from date`, `covered_to date`, `conflicts jsonb default '[]'`, `finalized_at timestamptz`, `error_message text`.

New table `courier_status_map` — configurable mapping, seeded with the owner's list:
`courier_status text primary key`, `derived_state text`, `is_final boolean`, `counts_as text` (`delivered` / `failed` / `excluded` / `in_progress`), `direction_hint text`, `label_ka text`, `sort_order int`. Admin-editable; the import reads it (falls back to current hard-coded rules when a status is unknown, and records unknown statuses for review).

New table `courier_alert_settings` — one row per rule with a threshold in days, admin-editable.

New derived states (kept alongside existing `derived_status` values so nothing breaks):
`DELIVERED`, `FAILED_FINAL`, `FAILED_ATTEMPT` (არ ჩაბარდა, non-final), `CANCELLED_EXCLUDED` (მიღების/აღების/შეკვეთის გაუქმება), `RETURN_COLLECTED` (ფილიალიდან გაცემა on a return), `RETURNED_FAILED` (ფილიალიდან გაცემა on an outbound), `IN_PROGRESS`.

GRANTs + RLS on every new table: `authenticated` read/write gated by `is_active_admin`, `service_role` full — same pattern as the existing courier tables.

## 1) Import with dedupe + preview

Client (`AdminCourierImport`, extended):
- Accepts .xlsx and .csv; existing ExcelJS parsing and header-row detection reused.
- Sends a `dry_run` request first; the edge function returns a full classification without writing. Preview shows: total rows, new, in-progress changed, in-progress unchanged, already-finalized (ignored), finalized-with-different-status (conflicts, listed), unmatched to a Lovable order, return rows linked / unlinked, file's date range.
- Coverage panel: last upload's min/max order date + uploaded_at, overall covered range, and the file's own range. Optional "only import orders created on/after [date]", pre-filled slightly before the last coverage start.
- Rows sent to the function in chunks (e.g. 800 rows per call) with a progress bar, so 4k+ files never hit a single-request limit.

Server (`import-courier`, extended):
- `dry_run` returns the full preview classification.
- Chunked mode: first call creates the batch (`processing`), later calls pass `batch_id`; a final `finalize` call sets `completed` (or `failed` with `error_message`). Each chunk updates the batch counters as it goes, so a crash leaves accurate partial numbers instead of zeros.
- Idempotency: finalized shipments are never modified — if the file disagrees, the row is appended to `batch.conflicts`. In-progress shipments update only when status/date changed, and each change appends a history row with `status_changed_at`.
- Direction: sender `ბიგმარტი` + order number = outbound; sender is a phone number / `Customer-####` with receiver `ბიგმარტი` = return.
- Return linking: match a return to an outbound order by normalized phone + comment item list + return date >= order date, filling the existing `linked_original_tracking_number` / `linked_return_tracking_number`. Unlinked returns surface in the preview and in the existing Return Matching page.
- Order sync: match by `public_order_number` first, tracking second; write `orders.courier_status` (raw Georgian text) and tracking when missing.
- A repair path sets the stuck Aug 7 batch to `completed` using actual counts from `courier_status_history`.

## 2) Statistics

New `AdminCourierStats` page (reusing the query patterns from `AdminCourierAnalytics`, which stays for shipment-level browsing).
- Delivery rate = delivered / (delivered + failed-final); every view also shows resolved share = resolved / handed-to-courier, plus the unresolved count.
- Filters: date range, direction (outbound / return).
- Views: KPIs + status breakdown; auto-confirmed vs operator-confirmed (`orders.auto_confirmed`, excluding `orders.is_return`); by product (from matched `order_items`, never the courier's SKU code) with a min-sample threshold; by city/region; by order-value band; by item count; by week.
- Sortable tables plus two charts (weekly delivery rate, status mix) using the existing recharts setup.
- Georgian original status shown next to the friendly label everywhere (extends `src/lib/courierStatus.ts`).

## 3) Alerts

New `AdminCourierAlerts` page + badge count on the Courier nav entry. Defaults, all editable in a thresholds panel:
outbound in საწყობში > 3d; არ ჩაბარდა (non-final) > 3d; any in-progress outbound with no status change > 5d; return in transit > 5d; shipped in our system but absent from courier data > 2d; delivered shipment that also has a return.
Age is computed from `status_date` / `status_changed_at`, not import date. Alerts group by product (product, stuck orders, units, oldest age) and expand to individual orders with tracking, phone, city, days stuck.

## 4) Restock view

Per product: units in finalized-failed orders split into already collected by us (`RETURN_COLLECTED`) / on the way back / no return registered; plus units in failed-attempt and in-progress orders as "possible additional returns". Units come from the matched order's `order_items`, with the return's own comment item list as fallback.

## Navigation

One new `Courier` accordion group in `AdminLayout`, collecting the new pages (Statuses, Statistics, Alerts, Restock) together with the existing Import / Mapping / Return Matching / Analytics entries, with the alert badge on the group. Routes added in `App.tsx` behind the existing `AdminGuard`.

## Questions before I build

1. `აღების გაუქმება` — treat exactly like `მიღების გაუქმება` (final, excluded from delivery-rate math)? My assumption: yes.
2. `ფილიალიდან გაცემა` on an outbound row: count as failed/returned in the delivery rate (my assumption: counts as a failed delivery), or excluded?
3. Should I retro-remap the existing 3,846 shipments to the new states (recommended, no data loss — `derived_status` stays as-is and `derived_state` is filled), or only apply the new mapping to future imports?
