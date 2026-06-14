# Packing Waves System

A new admin feature that groups orders into time-bounded "waves" for courier export, tracking import, and warehouse packing — with special trolley/slot support for multi-SKU orders.

## Scope guarantees (won't break)

- Existing order creation, order IDs, address normalization untouched
- Existing courier export columns and SKU field format (`"237 - 1"`) unchanged — only row sort order changes
- Existing tracking import logic (`bulk_update_tracking` RPC) reused as-is
- Existing Batches page kept intact (Waves is a new parallel system; we won't delete Batches)
- No "MULTI" text injected anywhere into SKU

## Database (one migration)

New tables (all in `public`, with GRANTs to `authenticated` + `service_role`, RLS via `is_active_admin`):

1. **`packing_waves`** — wave_number (auto seq), name, status (`draft|exported|tracking_imported|packing|completed|issue`), created_by, exported_at/by, exported_order_count, tracking_imported_at, stickers_printed_at/by, completed_at/by, notes
2. **`packing_wave_orders`** — wave_id, order_id (unique), classification (`single_sku|multi_sku`), primary_sku, sku_count, total_qty, packing_status (`not_packed|packing|packed|issue`), packed_at/by, issue_type, issue_note. **Unique constraint on order_id** prevents an order living in two waves.
3. **`packing_runs`** — wave_id, run_number (per wave), slot_count, status (`created|picking|packed|issue`), created_by, completed_at
4. **`packing_run_slots`** — run_id, slot_number, order_id, tracking_number_snapshot, packing_status, packed_at/by, issue_type/note. Unique `(run_id, slot_number)` and unique `(run_id, order_id)`.

Add to `orders` (nullable, additive only): `packing_wave_id uuid`, `packing_status text` default `'not_packed'`, `packed_at timestamptz`, `packed_by text`. No triggers altered.

Sequence: `packing_wave_number_seq` for human-friendly `#38, #39, …`.

RPCs (SECURITY DEFINER):
- `create_packing_wave(actor text)` — atomically selects eligible orders (confirmed, not canceled, not fulfilled, `packing_wave_id IS NULL`, has ≥1 order_item, has phone), inserts wave, inserts `packing_wave_orders` with classification computed from `order_items` (distinct SKU count), and stamps `orders.packing_wave_id`. Returns `{wave_id, total, single, multi}`.
- `assign_packing_run_slots(wave_id, slot_count, actor)` — picks next N unpacked multi-SKU orders in this wave (ordered by `created_at`), creates run, inserts slots 1..N. Idempotent on conflict.
- `complete_packing_wave(wave_id, force boolean, actor)` — guards on unpacked count unless `force=true`.

## Frontend

### New route `/admin/packing-waves` (`AdminPackingWaves.tsx`)

- Top: "Ready for next wave: **X orders**" counter + **Create Packing Wave** button
- Table of waves: Wave #, Created, By, Total / Single / Multi, Tracking imported (n/total), Packed (n/total), Status badge, Open button
- Status badges color-coded matching the spec

### New route `/admin/packing-waves/:id` (`AdminPackingWaveDetail.tsx`)

- Summary cards: Total / Single-SKU / Multi-SKU / Tracking imported / Packed / Remaining / Status
- Actions row: **Download Courier CSV**, **Import Tracking CSV**, **Mark Stickers Printed**, **Mark Wave Completed**
- "Single-SKU summary" table: SKU | Product name | Parcels | Total qty (read-only, info)
- "Multi-SKU Packing" section: counts + list of runs + **Create Pack Run** (slot picker 12/24/30/custom)
- Each run card → opens run detail

### New route `/admin/packing-waves/:waveId/runs/:runId` (`AdminPackingRun.tsx`)

- Print buttons: **Slot Setup Sheet**, **Pick-to-Slot Sheet**, **Final Check Sheet** (each opens print-friendly view in new tab)
- Slot grid: Slot # (large) · Order ID · Tracking · Items (SKU × qty) · Mark Packed · Issue
- **Mark run packed** button

### Print views (new components, plain semantic HTML + `window.print()`):

- `SlotSetupSheet.tsx` — Slot # | Order ID | Tracking | COD | Item count | City
- `PickToSlotSheet.tsx` — grouped by SKU asc: `SKU 237 — Mini Vacuum — Total 8 → Slot 1, 3, 7, 12; Slot 18 ×2`
- `FinalCheckSheet.tsx` — Slot # | Order ID | Tracking | Expected items (SKU × qty) | ☐

### Courier export sorting update

In `supabase/functions/export-courier/index.ts` (and any client-side wave export helper):

- Accept optional `wave_id` param; when present, filter strictly to wave orders
- New sort: classify each order, then sort
  1. `single_sku` rows first, ordered by `(primary_sku ASC, created_at ASC)`
  2. `multi_sku` rows at the end, ordered by `created_at ASC`
- SKU cell format unchanged (`"237 - 2"`); no "MULTI" tag added
- After successful download, client updates wave: `status='exported'`, `exported_at`, `exported_by`, `exported_order_count`

### Tracking import inside wave

Reuse `bulk_update_tracking` RPC. New wrapper `importTrackingForWave(waveId, rows, actor)`:
- Filters incoming rows to orders inside the wave
- Calls existing RPC
- Reports: updated / missing-in-db / belongs-to-other-wave / skipped-empty
- Updates wave `tracking_imported_at`, `status='tracking_imported'`

### Orders page badge

In `AdminOrders.tsx` row, when `packing_wave_id` set, render small badge: `Wave #38 · packed/not_packed/issue` — read-only, no behavior change.

### Navigation

Add `Packing Waves` to `AdminLayout` nav between Batches and Shipping.

## Files

**New**
- `supabase/migrations/<ts>_packing_waves.sql`
- `src/lib/packingWaveService.ts` (CRUD + RPC wrappers)
- `src/pages/admin/AdminPackingWaves.tsx`
- `src/pages/admin/AdminPackingWaveDetail.tsx`
- `src/pages/admin/AdminPackingRun.tsx`
- `src/components/admin/packing/CreateWaveButton.tsx`
- `src/components/admin/packing/CreateRunModal.tsx`
- `src/components/admin/packing/SlotSetupSheet.tsx`
- `src/components/admin/packing/PickToSlotSheet.tsx`
- `src/components/admin/packing/FinalCheckSheet.tsx`
- `src/components/admin/packing/WaveBadge.tsx`

**Edited**
- `src/App.tsx` — 3 new routes
- `src/pages/admin/AdminLayout.tsx` — nav entry
- `src/pages/admin/AdminOrders.tsx` — Wave badge in row
- `supabase/functions/export-courier/index.ts` — optional `wave_id` filter + new sort
- `src/integrations/supabase/types.ts` — regenerated after migration

## Phasing (single PR, but logical order)

1. Migration + types
2. Service layer + Waves list + Create Wave
3. Wave detail + courier export (wave-scoped, new sort)
4. Tracking import in wave + Stickers printed checkpoint + Orders badge
5. Multi-SKU runs + slot assignment + 3 print sheets
6. Wave completion guard

## Out of scope (explicit)

- No mobile-optimized warehouse scanner UI — desktop print-first workflow per spec
- No automatic wave creation on schedule — always manual button
- No barcode scanning input — visual checkboxes only
- Existing Batches system is **not** removed or migrated; Waves runs alongside

Ready to build on approval.
