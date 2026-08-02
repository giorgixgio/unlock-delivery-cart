# Fix stats mismatch + rebuild Operator Stats

## Why the two pages disagree (verified against live data)

The Dashboard and Operator Stats answer two different questions, but both label their numbers the same way.

1. **Different cohorts.** The Dashboard filters orders by *when the order was created*. Operator Stats filters by *when an operator set the call outcome*. On 31 Jul, 20 of 85 operator outcomes were on orders created on earlier days; on 27 Jul it was 62 of 117. So the sets never match.

2. **Different day boundaries.** The Dashboard uses the browser's local day (`startOfDay`/`endOfDay`), Operator Stats uses a Tbilisi (UTC+4) day. Orders between midnight and 04:00 land on different days on the two pages.

3. **Auto-confirmed orders.** The Dashboard's "Confirmed" counts the `is_confirmed` flag, which includes auto-confirmed orders with no operator involvement (e.g. 31 Jul: 106 confirmed, of which 63 auto). Operator Stats counts only outcomes an operator set. On 1–2 Aug every confirm was automatic, so the Dashboard shows confirms while Operator Stats shows zero.

4. **Different denominators.** Dashboard confirm rate = confirmed / active orders of that day. Operator Stats confirm rate = confirmed / handled sessions. Both are "correct" but not comparable.

5. **"Active orders" only exists on the Dashboard** — it is a live status snapshot, not a per-day operator figure.

## What I'll build

### A. Operator Stats gets two clearly separated views

A toggle at the top with two modes, both respecting the date filter:

- **Day performance ("what we actually got that day")** — cohort = orders *created* in the selected day: total leads, auto-confirmed, operator-confirmed, still pending, cancelled, merged, revenue. This block will match the Dashboard exactly.
- **Operator workload ("what operators did that day")** — cohort = call outcomes and sessions that *happened* in the selected day, regardless of when the order was created, with a breakdown of "on today's orders" vs "on earlier orders". This is the after-18:00 / next-day-callbacks case.

Each card gets a tooltip stating its cohort so nobody compares the wrong pair again.

### B. Auto-confirm made explicit

Add to the day-performance block: Auto-confirmed, Operator-confirmed, and "Operator-reachable leads" (leads minus auto-confirmed). Operator confirm rate will be computed against operator-reachable leads, not all leads, so operators are not penalised for orders the system confirmed before a call.

### C. Per-operator table additions

Per operator, split their outcomes into same-day vs backlog orders, add first-touch response time (order created → first operator session), and keep existing handling-time / upsell / address columns. Sorting stays as-is.

### D. Dashboard alignment

- Switch the Dashboard's day filter to the Tbilisi day boundary so both pages cut the day identically.
- Split the Dashboard's "Confirmed" card into Auto vs Operator confirmed (same total, added detail).
- Add a one-line note to the Dashboard confirm-rate card explaining its cohort is created-date, linking to Operator Stats.

Nothing else on the Dashboard changes; revenue, fulfilment, cancel-reason breakdown and return exclusion stay exactly as they are.

## Technical notes

- Files touched: `src/pages/admin/AdminOperatorStats.tsx`, `src/pages/admin/AdminDashboard.tsx`, plus a small shared helper for Tbilisi day boundaries so both use one implementation.
- Operator Stats will add a second orders query filtered on `created_at` (day-performance cohort) alongside the existing `call_outcome_updated_at` query (workload cohort).
- Backlog vs same-day split is derived by comparing the order's `created_at` Tbilisi day to the outcome's Tbilisi day — no schema change needed.
- First-touch response time comes from `operator_order_sessions.session_started_at` minus `orders.created_at`.
- No database migrations, no changes to order-processing logic, and no changes to the storefront.
