

## Fix: Auto-Confirmation Bypassed Due to Narrow Risk Lookback

### Root Cause

The `normalize-and-score` edge function's risk scoring has two blind spots:

1. **Canceled/merged orders are excluded** from the past-order query. A phone number with 12 prior orders (many canceled) looks "clean" because those orders are invisible to the scorer.
2. **10-day lookback window** is too short for phone-based signals. Phone numbers are a strong identity signal and should have a longer memory.

### Solution

Modify the `scoreRisk` function in `supabase/functions/normalize-and-score/index.ts`:

1. **Expand the status filter** to include `canceled` and `merged` orders in the lookback query. These still represent real activity from that identity.
2. **Use a 30-day window for phone matching** while keeping the 10-day window for weaker signals (cookie, IP). Phone numbers are persistent identifiers; cookies and IPs rotate.
3. **Weight canceled orders differently** -- a phone with many canceled orders is arguably *more* suspicious than one with confirmed orders (pattern of placing and canceling).

### Technical Changes

**File: `supabase/functions/normalize-and-score/index.ts`**

In the `scoreRisk` function (lines ~322-401):

- Change the past-orders query to remove the status filter restriction, querying all non-current orders from the last 30 days (excluding only `merged` status to avoid double-counting merged children)
- Add a new risk signal: `many_canceled` -- if 3+ canceled orders exist from the same phone in 30 days, add +20 risk
- Keep existing signal weights unchanged to avoid over-sensitivity

```text
Current query filter:
  .neq("status", "merged")
  .gte("created_at", tenDaysAgo)
  .or("is_confirmed.eq.true,is_fulfilled.eq.true,status.eq.new,status.eq.on_hold")

New query filter:
  .gte("created_at", thirtyDaysAgo)
  (no status filter -- include canceled orders in lookback)
```

For phone matching specifically:
- Still match against all statuses (including canceled)
- Add a sub-signal: if 3+ of those phone matches are canceled, add `many_canceled` (+20 points)

For cookie/IP matching:
- Continue using the full result set (which now includes canceled orders)
- No additional weight changes needed

### What This Fixes

- Order 100283 would have found order 100212 (canceled, same phone, Feb 23) plus all Feb 10-13 orders within 30 days
- Phone match alone = +35, which puts it at `medium` risk and blocks auto-confirm
- The canceled order pattern would add another +20, pushing it further into review

### What This Does NOT Change

- Auto-confirm threshold stays at risk_score = 0 (no relaxation)
- SKU overlap logic stays identity-gated (no false positives on popular items)
- High-risk threshold stays at 50
- Address, cookie, and IP signal weights stay the same
