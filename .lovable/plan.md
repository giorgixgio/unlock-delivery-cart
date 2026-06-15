
# Call Attempt & Cancellation Workflow

Convert "No Answer" from a final status into a retry counter, require a cancellation reason on every cancel, and surface unresolved orders for end-of-day cleanup.

## 1. Database (single migration)

Add to `public.orders`:
- `call_attempt_count int not null default 0`
- `last_call_attempt_at timestamptz`
- `last_call_attempt_by text`
- `next_call_after timestamptz` (for callback scheduling)
- `call_attempt_history jsonb not null default '[]'` — array of `{at, by, outcome}`
- `final_cancel_reason text` — enum-like: `no_answer_after_attempts | customer_refused | price_objection | delivery_issue | wrong_number | duplicate_order | changed_mind | other`
- `final_cancel_note text`
- `canceled_after_attempts boolean not null default false`
- `callback_at timestamptz` (reuse `next_call_after` if simpler — keep one; plan: use `next_call_after`)

Index: `(status, call_attempt_count)` and partial index on unresolved orders for retry-queue queries.

Site setting: `max_call_attempts` (default 3) stored in `site_settings`.

## 2. New component: `CancelReasonModal.tsx`

Opens when operator clicks "გაუქმდა" in `OrderQuickReviewModal`. Shows:
- 8 quick-reason buttons (Georgian labels per spec)
- Attempt counter pill on the "no_answer_after_attempts" button (`ცდა: X/3`); button disabled with hint when attempts < max
- Conditional textarea (required) for `other`
- Primary "გაუქმება დადასტურება" / secondary "უკან დაბრუნება"

Returns `{ reason, note }` to caller. Caller writes `status=canceled`, `final_cancel_reason`, `final_cancel_note`, `canceled_after_attempts`.

## 3. New component: `CallAttemptsPanel.tsx`

Rendered inside `OrderQuickReviewModal`. Shows:
- `ცდა X/3` badge
- Last attempt time + operator
- Suggested next action text
- Buttons: "არ პასუხობს — ცდა N/3", "გადასარეკია", confirm/cancel handled by existing modal buttons

When max reached, No-Answer button becomes disabled label "მაქსიმალური ცდები შესრულებულია" + hint to cancel with no_answer_after_attempts reason.

## 4. `OrderQuickReviewModal.tsx` changes

- Replace existing No-Answer action: instead of setting status, call new helper `recordNoAnswerAttempt(orderId, operator)` that increments counter, appends to history, keeps status as `needs_review`, fires toast `ცდა შენახულია: არ პასუხობს N/3`, then auto-advances to next order (preserving existing auto-advance flow).
- Replace Cancel action: open `CancelReasonModal` instead of directly setting `canceled`. On confirm, write cancellation with reason fields.
- Add Callback action: opens small picker with quick options (დღეს მოგვიანებით / ხვალ / 2 საათში / manual) → sets `status='callback'`, `next_call_after`.
- Render `CallAttemptsPanel` near top of modal.

## 5. `AdminOrders.tsx` list changes

- Per-row badge for `call_attempt_count > 0`: 1/3 amber, 2/3 orange, 3/3 red.
- New filter chip "Retry Needed": `call_attempt_count > 0 AND status NOT IN ('confirmed','canceled','fulfilled','merged')`.
- Show `final_cancel_reason` in canceled rows.

## 6. Callback expiry

Lightweight: in the list query, treat orders with `status='callback' AND next_call_after < now()` as needing review (show in Retry Needed filter and color the badge). No background job needed for v1.

## 7. Dashboard (`AdminDashboard.tsx`)

Add two new cards:
- **End of Day Remaining** — count of `status IN ('needs_review','callback','on_hold') AND status NOT IN ('confirmed','canceled','fulfilled','merged')` for today's cohort. Excludes callbacks whose `next_call_after > now()`. Click → opens AdminOrders with Retry Needed/Unresolved filter.
- **Cancellation Reasons** — small breakdown list grouped by `final_cancel_reason` for the current date range.

Add call-attempt stats line: avg attempts before confirm, avg before cancel, canceled-after-3.

## 8. Operator stats (`AdminOperatorStats.tsx`)

Extend the operator aggregation query to derive from `call_attempt_history` and `last_call_attempt_by`:
- `no_answer_attempts_count`
- `cancellations_after_attempts`
- `confirmed_after_{1,2,3}_attempts`

No Answer attempts never count toward the cancel column; only `status='canceled'` does.

## 9. Safety

- Confirmed flow, save handler, courier export, address normalization, item editing, and `operator_order_sessions` timing remain untouched.
- All new fields are nullable / defaulted; existing rows continue to work.
- `recordNoAnswerAttempt` is idempotency-safe (each click = one row in history with timestamp).

## Technical notes

- New helper file: `src/lib/callAttemptService.ts` with `recordNoAnswerAttempt`, `cancelOrderWithReason`, `scheduleCallback`.
- Cancel-reason constants + Georgian labels in `src/lib/cancelReasons.ts`.
- Max attempts read from `site_settings` via existing settings hook; fallback constant 3.
- Types regenerate after migration; UI work happens in a second pass.

## Out of scope (later phases)

- Background job to auto-bump expired callbacks back to needs_review (relying on query-time check for now).
- Manager override UI for early no-answer cancellation (warning shown; override = pick a different reason).
- Trend charts for call-attempt distribution.
