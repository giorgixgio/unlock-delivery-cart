# Courier Import & Historical Analytics

Build a system to ingest courier export Excel files repeatedly, keep full status history per tracking number, auto-link return shipments to their original delivery, and surface everything in dashboards and order detail.

## 1. Database (single migration)

Four new tables in `public`, all with RLS + GRANTs.

### `courier_import_batches`
`id uuid pk`, `file_name text`, `file_hash text` (sha256 of file bytes — for safe re-upload dedup), `uploaded_at timestamptz default now()`, `uploaded_by text`, `total_rows int`, `successful_rows int`, `error_rows int`, `new_shipments int`, `updated_shipments int`, `new_history_rows int`, `possible_returns int`, `auto_linked_returns int`, `errors jsonb default '[]'`, `status text default 'completed'`.
Unique on `file_hash` (re-upload detection — return existing batch instead of duplicating).

### `courier_shipments`
`id uuid pk`, `original_order_id uuid null references orders(id)`, `tracking_number text unique not null`, `order_number text`, `phone text`, `phone_normalized text` (digits only, generated), `customer_name text`, `city text`, `address text`, `sku text`, `quantity int`, `cod_amount numeric`, `company_receives numeric`, `current_courier_status text`, `derived_status text`, `shipment_type text` (`CUSTOMER_DELIVERY|RETURN_TO_SENDER|UNKNOWN`), `first_seen_at timestamptz`, `last_seen_at timestamptz`, `latest_status_date timestamptz`, `linked_original_tracking_number text`, `linked_return_tracking_number text`, `created_at`, `updated_at`.
Indexes: `(phone_normalized, sku)`, `(derived_status)`, `(shipment_type)`, `(latest_status_date)`, `(original_order_id)`.

### `courier_status_history`
`id uuid pk`, `courier_shipment_id uuid references courier_shipments(id) on delete cascade`, `tracking_number text`, `import_batch_id uuid references courier_import_batches(id)`, `courier_status text`, `derived_status text`, `status_date timestamptz`, `cod_amount numeric`, `company_receives numeric`, `raw_row_json jsonb`, `created_at timestamptz default now()`.
Unique partial: `(courier_shipment_id, courier_status, status_date)` to dedupe re-imports of same status.
Index `(courier_shipment_id, created_at desc)`.

### `return_matches`
`id uuid pk`, `original_shipment_id uuid references courier_shipments(id) on delete cascade`, `return_shipment_id uuid references courier_shipments(id) on delete cascade unique`, `confidence_score int`, `match_reason text`, `matched_by text` (`AUTO|MANUAL`), `created_at timestamptz default now()`, `created_by text`.

GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`, ALL to `service_role` on all four. RLS policies: only `is_active_admin(auth.uid())` can read/write (mirrors existing admin tables).

## 2. Edge function: `import-courier`

`supabase/functions/import-courier/index.ts`, `verify_jwt = false` (admin check via auth header → `is_active_admin`).

Input: multipart with `file` (xlsx) and optional `uploaded_by`.
Steps:
1. Compute sha256 of file bytes → if `courier_import_batches.file_hash` already exists, return existing batch summary (idempotent).
2. Parse xlsx server-side with `npm:xlsx`. Auto-detect Georgian headers (tracking, status, COD, company_receives, phone, name, city, address, SKU, qty, order number, status date) using header-name map with fallbacks.
3. Insert batch row with `status='processing'`.
4. For each row:
   - Normalize tracking number; skip if empty (error row).
   - Compute `derived_status` + `shipment_type` (logic below).
   - Upsert `courier_shipments` on `tracking_number`: insert new or update only "current" fields. Track `first_seen_at` once.
   - If derived/courier status changed vs previous latest, insert `courier_status_history` row (unique constraint prevents dup).
   - On insert with `shipment_type='CUSTOMER_DELIVERY'`, try to match to `orders.tracking_number` → set `original_order_id`.
   - On insert with `shipment_type='RETURN_TO_SENDER'`, run return-matching against existing CUSTOMER_DELIVERY shipments and write `return_matches` (AUTO if score ≥70).
5. Update batch counters and `status='completed'`. Collect per-row errors into `errors jsonb`.

### Derived status mapping
Pure helper in function file (also mirrored client-side in `src/lib/courierStatus.ts` for display labels):
- `DELIVERED_TO_CUSTOMER`: status contains `ჩაბარებული` AND cod > 0 AND company_receives > 0.
- `RETURNED_TO_SENDER`: status contains `დაბრუნებ`/`უკან`/return keywords, OR (`ჩაბარებული` AND cod=0 AND company_receives=0).
- `CANCELLED_OR_REFUSED`: status contains `მიღების გაუქმება`/`უარი`/`გაუქმებ`.
- `IN_TRANSIT`: contains `გაგზავნილი`/`გზაში`/`საწყობ`/`კურიერთან`/`დამუშავება`.
- `UNKNOWN`: fallback.
`shipment_type` = `CUSTOMER_DELIVERY` for everything except those classified as RETURN keyword set (or zero-money ჩაბარებული) → `RETURN_TO_SENDER`.

### Return matching (auto)
For each new RETURN shipment, query candidate CUSTOMER_DELIVERY shipments where `phone_normalized = ?` AND `latest_status_date BETWEEN return.date - 21d AND return.date`. Score:
- same phone +40, same SKU +25, same name (case-insensitive trim) +15, same city +10, date in window +10, same `order_number` +50.
Pick highest; if ≥70 → insert `return_matches` (AUTO), set `linked_original_tracking_number` / `linked_return_tracking_number` on both shipments. 50–69 → write match row with `matched_by='SUGGESTED'`. <50 → skip.

## 3. Admin pages

Route group under `/admin/courier-import/*`. Add to `AdminLayout` sidebar.

### `AdminCourierImport.tsx` — upload + batch history
- Dropzone for .xlsx. On upload, call edge function via `supabase.functions.invoke('import-courier', { body: formData })`.
- Table of past batches: date, file name, rows, new shipments, updated, new history, possible returns, errors (expandable JSON viewer).

### `AdminCourierReturnMatching.tsx` — manual matching queue
- Lists `return_matches` with `matched_by='SUGGESTED'` + RETURN shipments with no `return_matches` row.
- Per row: return tracking, return date, phone, SKU, customer, city, suggested original (top candidate w/ score), buttons: **Link**, **Ignore**, **Search manually** (opens a search modal querying CUSTOMER_DELIVERY shipments by phone/SKU).
- Link → upsert `return_matches` with `matched_by='MANUAL'` + score, update both shipments' linked tracking fields.
- Ignore → mark via match row `matched_by='IGNORED'`.

### `AdminCourierAnalytics.tsx` — dashboard
Filters (sticky toolbar): date range (on `latest_status_date`), SKU multi-select, city, derived status, shipment type.
- KPI cards: total shipped, delivered, refused/cancelled, returned, in transit, delivery %, cancel %, return %, COD total, company_receives total, avg days to delivery (delivered.latest_status_date − first_seen_at), avg days to return (matched return shipment date − original first_seen_at).
- SKU table + City table with delivery/return rates.
All powered by client-side aggregation over filtered `courier_shipments` (+ `return_matches` joins). For v1, fetch up to N rows with filters; can move to RPC later.

## 4. Order detail integration

In `AdminOrderDetail.tsx`, add `<CourierHistorySection orderId={order.id} trackingNumber={order.tracking_number}/>`:
- Resolves the `courier_shipments` row via `original_order_id` OR `tracking_number`.
- Shows current courier status, derived status, shipment type, linked return tracking (if any).
- Timeline of `courier_status_history` rows (date, courier status, derived) sorted desc.
- Renders for fulfilled and active orders.

New file: `src/components/admin/CourierHistorySection.tsx`.

## 5. Files

New:
- `supabase/functions/import-courier/index.ts`
- `src/lib/courierStatus.ts` (derived status helpers + label/color maps in Georgian)
- `src/pages/admin/AdminCourierImport.tsx`
- `src/pages/admin/AdminCourierReturnMatching.tsx`
- `src/pages/admin/AdminCourierAnalytics.tsx`
- `src/components/admin/CourierHistorySection.tsx`

Edited:
- `src/App.tsx` — three new admin routes.
- `src/pages/admin/AdminLayout.tsx` — sidebar group "Courier Import" with three subitems.
- `src/pages/admin/AdminOrderDetail.tsx` — render `CourierHistorySection`.
- `supabase/config.toml` — add `[functions.import-courier] verify_jwt = false`.

## 6. Safety / out-of-scope

- Existing courier export, orders flow, fulfillment, dashboard are untouched.
- Future-proof columns (campaign/adset/ad/creative/landing/operator) NOT added now — left to a future migration on `courier_shipments`.
- Re-upload of identical file is idempotent via `file_hash`. Same status re-imported is deduped via unique constraint.
- All raw rows are stored in `courier_status_history.raw_row_json` for debugging.

## 7. Column header detection

The Excel header map (Georgian → field) lives at top of edge function. Default mapping (with fallbacks/aliases):
```
შტრიხკოდი / ნომერი / tracking → tracking_number
სტატუსი / მიმდინარე სტატუსი → courier_status
სტატუსის თარიღი / თარიღი → status_date
თანხა / გადასახდელი / COD → cod_amount
კომპანია იღებს / ჩასარიცხი → company_receives
ტელეფონი / მობილური → phone
სახელი / მიმღები → customer_name
ქალაქი → city
მისამართი → address
SKU / არტიკული → sku
რაოდენობა / ცალი → quantity
შეკვეთის ნომერი → order_number
```
If a required column is missing, the batch fails with a clear error before processing.
