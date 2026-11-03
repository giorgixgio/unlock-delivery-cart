# Onway webhook as live courier source (Excel stays as fallback)

## Corrections to your assumptions
1. **Webhook (confirmed):** it matches only on `orders.onway_tracking`. It writes only `onway_webhook_log`, `onway_status_map`, `onway_status_events`, the `orders.onway_*` fields, `sms_enqueue` and Telegram. It never writes `courier_shipments` or `courier_status_history`, and never sets `orders.courier_status` or `tracking_number`. One addition: it also writes `onway_comment_ai_cache`.
2. **`recoveryOf()` is not in `courierRecovery.ts`.** It lives in `src/lib/courierAnalytics.ts:47`. `courierRecovery.ts` exports `recoveryBySku`, `recoveryTotals`, `buildTrackingIndex` and `unattributedShipments`. Both stay the single source of logic.
3. **The Excel importer has no "newer wins" check.** It skips finalized shipments, but for open ones it compares the raw status text and the date string. If the text changed, it writes the change and sets `status_changed_at = now()`, which is import time, not courier time. So an older Excel file can roll a status back today.
4. **Finalized rows still get re-linked.** The importer skips finalized rows for the upsert, but still feeds them to `courier_sync_orders` and `courier_link_returns`.
5. **History dedupe already exists:** unique index `courier_status_history_dedup_idx` on `(courier_shipment_id, coalesce(courier_status,''), coalesce(status_date,epoch))`. No new index is needed.
6. **`courier_shipments.tracking_number` is already UNIQUE NOT NULL,** so it is the upsert key. `phone_normalized` is a generated column and is never written.
7. **Products page:** there is no separate "arriving" column. "Expected return" equals `inTransitUnits + notRegisteredUnits`. "Received back" equals `collectedUnits` and "In progress" equals `inProgressUnits`. All three already use `recoveryBySku()` (`AdminProducts.tsx:256`). No catalog page uses another calculation.
8. **Small importer bug:** it reads `res.linked`, but return-link v2 returns `linked_exact` and `linked_phone_only`, so the "linked" counter shows 0. I'll fix this while I'm in that file.
9. **Second-pass race:** phone-only matching in v2 can let two returns claim the same single original in one run. I'll add a guard when moving this into shared code.
10. **No pull endpoint exists yet.** Only `order/add`, `regions`, `getuserinvoice` and `getusercod` are used, with secrets `ONWAY_API_USERNAME` and `ONWAY_API_KEY`. The SHA-256 code in the webhook is for the AI-comment cache, not API signing. The pull endpoint's name and hash format must come from Onway docs (open question 1).
11. **Status map:** `აღების გადადება` is missing from `courier_status_map` (confirmed). `აღების გაუქმება` maps to CANCELLED_EXCLUDED outbound and RETURN_CANCELLED for returns. That matches "never handed to courier", so I'm keeping it.
12. **The log holds 6 rows,** from Oct 28 to Oct 30. Nothing has arrived since then, so the Nov 2 API orders have no webhook rows yet. Acceptance test 5 depends on Onway actually pushing (see the "webhook silent" alert below).

## A. Shared parsing and mapping (no copy-paste)
New `supabase/functions/_shared/courierShipment.ts`, pure and unit-tested. It holds code moved out of `import-courier/index.ts`:
- `parseCommentItems`, `itemsKey`, `normPhone`, `pickCustomerPhone`, `senderIsCustomer`, `parseDate`, `legacyOf`, the derived-state lookup (outbound vs return columns, unmapped → IN_PROGRESS and not final) and the `FINAL_STATES` set.
- New `parseOnwayStamp(date "dd.mm.yyyy", hour "HH:MM", tz "+04")`, which converts to a UTC ISO time.
- New `buildShipmentRow(input, statusMap)`. Both sources produce a neutral input, and this one function builds the `courier_shipments` row.
- New `onwayPayloadToInput(body)`. It maps `trackingnumber`, `parent_trackingnumber`, `to_*`/`from_*`, `cash_amount`, `order_detail` (→ `comment_raw` and `comment_items`), `from_date` (→ `order_date`), the newest history entry (→ `latest_status_date`), the first pickup status (→ `pickup_date`) and the final-state entry (→ `final_status_date`).
- `is_return` is true when `parent_trackingnumber` is non-empty or `senderIsCustomer(from_name)`. The phone comes from `pickCustomerPhone`, so a return uses the sender (the real customer) and 555555555 is never stored.

`import-courier/index.ts` will import these helpers, with no change in behavior. Before the refactor I'll add a test that parses one sample Excel row and asserts the exact old output.

## B. Single write path in the database (one RPC used by both sources)
New migration (additive):
- On `courier_shipments`: add `source text default 'excel'` (`api` | `excel`), `source_status_at timestamptz` (courier-side time of the current status) and `onway_parent_tracking text`.
- On `courier_status_history`: add `source text default 'excel'`. `import_batch_id` is already nullable.
- `courier_status_map`: insert `აღების გადადება` → IN_PROGRESS for both directions, not final.
- New SECURITY DEFINER RPC `courier_upsert_shipment(p_row jsonb, p_history jsonb, p_source text)`, granted to service_role only. In one transaction it:
  1. Locks the existing row by tracking number. If its `derived_state` is final, it only adds missing history rows and stops (immutable as today).
  2. Applies the newer-wins rule: it updates status fields only if the incoming `source_status_at` is greater than or equal to the stored one, or the stored one is null. Non-status fields (name, address, COD) fill only when blank.
  3. Inserts history rows with `ON CONFLICT DO NOTHING` on the existing dedupe index.
  4. Sets `original_order_id`, matching in order on `orders.onway_tracking`, then `tracking_number`, then `public_order_number` (exact).
  5. Sets `orders.courier_status`, and sets `tracking_number` if it is missing, with the same rules as `courier_sync_orders`. Placeholder phones are never used.
  6. For returns: if `onway_parent_tracking` is set, it links both rows directly. Otherwise it calls the existing `courier_link_returns(array[tracking])`, so the phone and items logic runs unchanged.
- `import-courier` keeps its batch upsert, but its comparison is replaced by the same newer-wins rule, using the Excel status date as `source_status_at`. Finalized rows are excluded from the sync and link calls (fixes item 4).

## C. Webhook change (`onway-webhook/index.ts`)
Inside the existing `processEvent`, which still runs under `EdgeRuntime.waitUntil`:
- After parsing, it calls `onwayPayloadToInput` → `buildShipmentRow` → `rpc('courier_upsert_shipment', …, 'api')`.
- It runs even when no order matches, because the shipment row is still useful.
- Errors are logged to `onway_webhook_log.process_error` and never change the 200 response or the existing SMS and Telegram steps.
- Unknown status names are inserted into `courier_status_map` (IN_PROGRESS, not final) with a new `needs_review boolean default false` set to true. They don't count in delivery-rate math, because IN_PROGRESS is already excluded from final rates.

## D. Pull safety net and alerts
- New function `onway-status-pull`, secured by an `x-cron-secret` header checked against an `internal_job_secrets` row named `onway_status_pull` (same pattern as `sms-queue`). All calls go through `_shared/proxyFetch.ts`.
- It picks open `source='api'` shipments with no webhook in the last 6 hours, up to 150 per run, and sends each pull result through the same RPC.
- Schedule: every 30 minutes, which is 48 runs a day. When nothing is open, the run is a single small query.
- **"Webhook silent" rule:** a new `courier_alert_settings` row `webhook_silent` with threshold in hours. The pull job checks it: on a working day from 10:00 to 20:00 Tbilisi time, if open API shipments exist and the last webhook is older than X hours, it sends one Telegram alert per day through `_shared/telegram.ts`. The Telegram memory rules need this new allowed category added (open question 4).
- **Backfill:** the same function in `mode:'backfill'` (admin only) pulls every open API shipment. It is triggered from a button on Courier Import.

## E. Frontend
- `useCourierDataset`: set `staleTime` to 60 s and `refetchInterval` to 90 s, only while the tab is visible (`refetchIntervalInBackground:false`). Add a Refresh button on the Courier Stats, Restock and Alerts headers.
- New small hook `useCourierFeedStatus`. It shows "Last webhook: HH:MM", the count of unmapped statuses (a banner linking to Courier Statuses, where they can be classified), and API vs Excel counts. A source badge shows on the Statuses list and in `CourierHistorySection`.
- `AdminCourierImport`: add a header note saying "Fallback / backfill — old Onway account and historical data", plus the backfill button.
- **Paging:** the dataset loads every shipment in 1000-row pages, 6 at a time. At roughly 20k rows today that is fine. I'll flag it if it goes past about 60k. A database view or RPC is not proposed now.

## F. Consumers audit
| Consumer | Reads | After change |
|---|---|---|
| AdminCourierStats, AdminCourierRestock, useCourierAlerts / AdminCourierAlerts, AdminProducts recovery columns | useCourierDataset | Updates automatically |
| useCourierAlertBadge | courier_shipments counts | Updates automatically |
| AdminCourierStatuses | courier_shipments plus status map | Updates automatically, plus the unmapped banner |
| CourierHistorySection (order detail) | shipments plus history | Updates automatically, plus source badge |
| AdminCourierReturnMatching | courier_shipments | Updates automatically; parent-linked returns arrive already matched |
| AdminCourierAnalytics, AdminCourierImport | batches plus shipments | Unchanged (Excel-only view), plus fallback label |
| AdminOperatorStats | shipment freshness | Updates automatically |
| DeliveryProblemsPanel | orders.onway_last_status | Unchanged |
| AdminOrderDetail | orders.courier_status | Updates automatically |

Products already uses `recoveryBySku()`, so no change is needed there.

## G. Stock (no changes)
- Confirmation (migration 0010) and fulfillment (0001) both call `deduct_order_stock_once`, which deducts once.
- Cancel restores stock only through an explicit RPC.
- Nothing increases stock on a failed delivery or a return.
- See question 5 for a possible "ready to restock" count.

## Acceptance tests (`src/test/courierShipment.test.ts` plus a SQL replay)
1. Replaying the 6 logged payloads for tracking 106139357 gives exactly 1 shipment row, status `აღების გაუქმება`, and 6 history rows after dedupe. With order 122579 unmatched, it still makes no order writes.
2. Replaying the same payload twice changes nothing: same `updated_at` and history count.
3. An older payload sent after a newer one does not regress the status.
4. For a sample of Excel-imported trackings, the derived state from the webhook path equals the stored Excel one (pure test using the shared helpers).
5. After deploy, run the backfill for the 3 Nov 2 API orders. They appear in Courier Stats within one refetch (90 s) of a status change.
6. A fixture return with `parent_trackingnumber` links to its original, and the original's units move into the on-the-way, then received, buckets in `recoveryBySku`. The phone-matching function is not called.

## Files
- New: `supabase/functions/_shared/courierShipment.ts`, `supabase/functions/onway-status-pull/index.ts`, `src/hooks/useCourierFeedStatus.ts`, `src/test/courierShipment.test.ts`, migration `00xx_courier_live_onway.sql`, and the cron schedule (run as one-off SQL, not a migration).
- Edit: `onway-webhook/index.ts`, `import-courier/index.ts`, `useCourierDataset.ts`, `AdminCourierStats.tsx`, `AdminCourierRestock.tsx`, `AdminCourierAlerts.tsx`, `AdminCourierStatuses.tsx`, `AdminCourierImport.tsx`, `CourierHistorySection.tsx`, `AGENTS.md`.

## Risks
- **Unknown pull endpoint:** the endpoint and hash format are unknown, so the pull and backfill can't be built without docs.
- **Excel catch-up:** with newer-wins, an Excel file whose dates can't be parsed won't override API data. That is intended, but historical-only fixes then need a "force" option.
- **Return detection:** a `parent_trackingnumber` meaning is unverified. Until a real return arrives, the phone and items fallback stays active.
- **Webhook load:** the RPC adds about 1 DB round-trip per push, in the background, so the response stays fast.

## Open questions
1. Can you share Onway's per-tracking status endpoint (path and hash formula)? Or should I try `api/order/get` with `sha256(username+key+tracking)` read-only first?
2. Should Excel be able to override API data for the same tracking number (a "force" checkbox), or should API always win while both are open?
3. Webhook-silent threshold: 3 hours on working days 10:00–20:00 Tbilisi time, OK?
4. May I add "webhook silent" to the allowed Telegram alert types?
5. Do you want a read-only "ready to restock" count on Restock and Products (returns at `ფილიალიდან გაცემა` not yet put back on the shelf)?
