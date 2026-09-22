# Returned-stock columns on the Products page

Show, for every product in the admin SKU list, how much stock is already back in the warehouse, how much is coming back, and how much is still undecided — using the exact same calculation the Courier section already uses.

## What the owner sees

Three new compact columns in the products table (all tabs), after Stock:

| Column | Meaning | Look |
| --- | --- | --- |
| დაბრუნებით მიღებული | Units from failed orders already collected back | green badge |
| მოსალოდნელი დაბრუნება | Failed orders whose return is in transit, plus failed orders with no return registered | amber badge, two stacked small numbers (in transit / no return yet) |
| პროცესში | Units on outbound parcels not yet resolved | gray muted number |

- Header cells for the first two columns are clickable to sort descending, so piled-up returnable stock floats to the top.
- One summary line above the table: "across all products: X received · Y on the way · Z in progress", with a date range picker (from/to, default all-time) matching the Courier statistics filter.
- Hovering a badge shows a tooltip listing the individual orders behind the number (order number, tracking, status, units) — capped at the first 15 with a "+N more" line.
- A small info icon next to the summary: numbers only include orders that appear in an imported courier file.

## Where the shared calculation lives

The recovery logic today sits partly in `src/lib/courierAnalytics.ts` (`recoveryOf`, `addRecovery`, `emptyRecovery`, `unitsFor`) and partly inline in `AdminCourierRestock.tsx`. Extract the per-SKU aggregation into one new module:

`src/lib/courierRecovery.ts`
- `buildTrackingIndex(ds)` — tracking → shipment map.
- `recoveryBySku(ds, opts?: { from?: string; to?: string })` → `Map<sku, SkuRecovery>` where `SkuRecovery = { sku, title, collectedUnits, inTransitUnits, notRegisteredUnits, inProgressUnits, collectedOrders, inTransitOrders, notRegisteredOrders, inProgressOrders, details: RecoveryDetail[] }`.
- `RecoveryDetail = { bucket, orderNumber, tracking, status, units }` for the tooltips.
- `recoveryTotals(map)` for the summary line.

It keeps calling the existing `recoveryOf` / `isOutbound` / `isFailedFinal` / `isInProgress` / `unitsFor` — no second calculation, no behaviour change. `AdminCourierRestock.tsx` is refactored to consume `recoveryBySku` so both pages are provably identical. The one difference from today's restock page is that "on the way" and "no return registered" are kept as separate sub-counts instead of only being displayed separately; restock keeps rendering its existing columns from those fields.

## Technical notes

- Data source: `useCourierDataset()` (already pages all `courier_shipments`, matched `orders`, `order_items` and `courier_status_map`). The Products page calls the same hook; React Query caches it, so opening Products after Courier costs nothing extra.
- Date filtering uses `shipmentDate(s)` (order date, falling back to latest status date), the same field the Courier stats page filters on.
- `AdminProducts.tsx`: add the three `<th>`s and `<td>`s inside the existing `renderProductTable`, looked up by `row.sku`; add a `recoverySort` state (`null | "received" | "onway"`) applied in the existing filtered-rows memo. Existing shadcn `Badge`, `Tooltip` and the current plain table markup are reused — no new table component.
- Products with no courier history render an em dash, not zeros.
- No database or edge-function changes; read-only.
