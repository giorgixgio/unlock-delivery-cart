# Plan: Operator Quick-Review Modal

Big-picture: introduce an **operator quick-review modal** on top of the orders list. Reuse the existing save logic from `AdminOrderDetail` / `orderService` / `EditableOrderFields` so courier export, normalization, and DB shape stay identical. The current full order page remains and is reachable via an "Open full details" link.

## 1. Schema additions (small, safe migration)
Add to `public.orders`:
- `operator_viewed_at timestamptz NULL`
- `operator_viewed_by text NULL`
- `operator_review_status text NULL` — free text, allowed values used by UI: `unviewed | viewed | confirmed | no_answer | needs_callback | cancelled`
- `operator_note text NULL` *(only if not already present — will check before adding)*

No existing columns renamed/removed. No changes to `city`, `raw_city`, `normalized_city`, `address_line1`, `address_line2`, `raw_address`, `normalized_address`.

## 2. New file: `src/components/admin/OrderQuickReviewModal.tsx`
Centered Dialog on desktop, full-screen Sheet on mobile (`useIsMobile`). Width ~820px.

Structure:
- **Sticky header**: `შეკვეთა #<public_order_number>` · phone · COD · total · status badge · created time · prev/next arrows · "Open full details" link → `/admin/orders/:id` · close X.
- **Customer card**: phone (large), `Call` (`tel:`) + `Copy` buttons.
- **Address card (operator simple view)**:
  - `ქალაქი / რეგიონი` — single input
  - `მისამართი` — single input
  - `კომენტარი კურიერისთვის` — textarea
  - `<Collapsible>` "Advanced address fields" reveals the existing 7 fields (read-only by default with an "Edit raw" toggle) so power users can still inspect/override.
- **Quick status buttons**: დადასტურდა / არ პასუხობს / გადასარეკია / გაუქმდა → updates `operator_review_status` (+ existing `status`/`is_confirmed` where it already maps in AdminOrderDetail).
- **Items list**: compact thumbnails/SKU/qty/price (read-only here; edits stay on full page).
- **Operator note**: textarea bound to `operator_note`.
- **Sticky footer**: `შენახვა` (primary), `შენახვა და შემდეგი` (secondary).

### Data mapping when operator types in simple fields
Reuse the existing save path from `AdminOrderDetail`/`orderService.updateOrderAddress` so behavior is identical to the full page:
- City input → writes `city` **and** `raw_city`. Then attempt existing normalization (whatever path the full page already uses, e.g. the `normalize-and-score` edge function or local util — invoked exactly the same way). On success, write `normalized_city`. On failure, leave `normalized_city` untouched.
- Address input → writes `address_line1` **and** `raw_address`. Normalize same way → `normalized_address` on success only.
- Courier comment → writes `address_line2`.
- Never null-out an existing normalized field; only overwrite on successful re-normalization.

## 3. Orders list integration (`src/pages/admin/AdminOrders.tsx`)
- Row click opens the modal instead of navigating. Keep right-click / cmd-click on the "open full" link working for the old page.
- Maintain `currentList: Order[]` (the filtered list already in state) and `activeIndex` to power prev/next.
- On open / prev / next: optimistically set `operator_viewed_at = now()`, `operator_viewed_by = current admin email`, `operator_review_status = 'viewed'` (only if currently null/`unviewed`), then persist via a single `supabase.from('orders').update(...)`.
- Row visuals:
  - **Unviewed** (`operator_viewed_at IS NULL`) in Needs Review tab: subtle `bg-amber-50/40 dark:bg-amber-950/10` + `border-l-4 border-amber-400` + small "ახალი" badge.
  - **Viewed**: default styling, no badge.
- After modal save/close, patch the row in local state so the list updates without a refetch.

## 4. Reuse, don't rewrite
- `OrderQuickReviewModal` imports the same mutation helpers `AdminOrderDetail` uses (`updateOrderAddress`, status mutators, note save). If a helper is page-local, lift it into `src/lib/orderService.ts` first, then call it from both places — no duplicated SQL, no new export field touched.
- `export-courier` edge function and `normalize-and-score` are untouched.

## 5. Files

```text
NEW   src/components/admin/OrderQuickReviewModal.tsx
EDIT  src/pages/admin/AdminOrders.tsx          // open modal, viewed highlighting, prev/next list
EDIT  src/lib/orderService.ts                  // lift any inline save helpers + markOrderViewed()
EDIT  src/integrations/supabase/types.ts       // regenerated after migration
NEW   supabase/migrations/<ts>_operator_review.sql
```

`AdminOrderDetail.tsx` is **not** rewritten — still reachable via "Open full details".

## 6. Risks & mitigations
- **Breaking existing save** → reuse exact same mutation functions; no parallel SQL.
- **Erasing normalized values** → only write `normalized_*` on successful normalization; never write empty strings.
- **Duplicate orders** → all writes are `UPDATE` by `id`, never INSERT.
- **Courier export** → field names untouched; mapping verified to match what `export-courier` reads (`normalized_city || city`, `normalized_address || address_line1`, `address_line2`).
- **Migration risk** → only additive nullable columns; safe to roll out.

Proceed?