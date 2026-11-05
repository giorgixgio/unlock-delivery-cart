# Operator Issue Tickets — plan

## What already exists (checked in code)
- `customer_requests` (migration 0032): `kind` CHECK = change_address/change_day/call_me/cancel_save/self_canceled; `status` CHECK = open/done; staff RLS via `is_active_staff`. UI: `src/components/admin/CustomerRequestsPanel.tsx`.
- Public tracking page `src/pages/OrderTracking.tsx` (`/t/:token`) → edge function `supabase/functions/order-tracking` (actions get/change/set_address/call_me/cancel/rate_operator, `tracking_rate_hits` rate limit, service role, fixed safe field set). `orders_set_tracking_token` trigger + `gen_tracking_token()` exist.
- SMS: `sms_queue` (type CHECK: call_no_answer/order_confirmed/out_for_delivery/delivery_failed, UNIQUE(order_number,type,seq)), `sms_enqueue()` (service-role only), `sms-queue` worker, `_shared/smsTemplates.ts` (GSM-7 guard, quiet hours), `sms_logs.type` CHECK (last set in 0031).
- Call queue: `call_queue_is_open(o)` is the single "is this lead callable" gate used by `call_queue_tier` / `call_queue_next` / stats; mirrored by `isQueueOpen` in `src/lib/queueSearchRules.ts` and `src/lib/callQueuePolicy.ts`.

**Important correction on SMS length:** this project deliberately sends Latin-transliterated GSM-7 texts (memory rule + `isGsm7` guard), 160 chars/segment — not Georgian UCS-2 (70 chars). The drafts below follow that: Georgian meaning shown for approval, Latin text is what is sent, each 1 segment.

## How a lead leaves the queue (least invasive)
- New column `orders.support_hold boolean NOT NULL DEFAULT false`.
- `call_queue_is_open` gets one extra line: `AND COALESCE(o.support_hold,false) = false`. Every queue path (next, tier, stats, search-open rules) already goes through it, so no other query changes. Mirror in `isQueueOpen` + `callQueuePolicy` (+ tests).
- Ticket creation RPC sets `support_hold = true`, `next_call_after = NULL`, clears `queue_locked_by/until`, writes order_event `support_ticket_created`. It never touches `status`, `is_confirmed`, stock or `call_outcome`.
- Reviewer "Release to queue" (RPC) sets `support_hold = false` + event. Resolving a ticket does NOT auto-release (reviewer chooses).
- Search in Call Queue still finds the order; the card shows "⚑ in support" and outcome buttons are disabled (via `orderActions`).

## Migration `0050_support_tickets.sql`
1. `customer_requests`:
   - extend kind CHECK with `operator_flag`; status CHECK → open, in_review, waiting_customer, resolved, done (old rows keep open/done).
   - add `assigned_to text`, `sla_due_at timestamptz`, `last_customer_reply_at`, `last_admin_update_at timestamptz`, `resolution text` (CHECK explained/tutorial_sent/replacement/refund/unreachable/other), `resolved_at`, `created_by text`.
   - indexes: `(kind,status)` partial where open-ish; `(order_id)`; partial unique `one open operator_flag per order`.
2. `support_ticket_messages` (id, request_id FK, author_type customer/operator/admin/system, author text, body ≤1000, link_url, video_url, notify_customer bool, created_at). GRANT select/insert to authenticated, ALL to service_role; RLS: active staff read/insert. No anon grant.
3. `support_ticket_settings` (single row): enabled bool, sla_working_days int=2, working_days int[]={1..5}, tz text='Asia/Tbilisi', ack_delay_min=5, followup_working_days=1, min_gap_min=30, max_auto_sms=3, quiet_from='21:00', quiet_to='09:00', sms_ack/sms_followup/sms_update text. RLS: staff read, admins update.
4. `orders.support_hold` + extended `call_queue_is_open`.
5. `sms_queue.type` and `sms_logs.type` CHECKs extended with support_ack, support_followup, support_update; `sms_queue.request_id uuid` nullable column; update seq uniqueness so updates use seq = message counter.
6. Functions (SECURITY DEFINER, `is_active_staff` checked inside, search_path set):
   - `support_add_working_days(ts, n)` — Mon–Fri Tbilisi, from settings.
   - `support_ticket_create(p_order_id, p_reason, p_text)` → ensures tracking token, inserts ticket + first message, sets hold, enqueues ack (+delay, quiet-hours shifted) and followup (+1 working day). Idempotent: existing open ticket is returned.
   - `support_ticket_post_update(p_request_id, p_body, p_link, p_video, p_status, p_notify)` → message, `last_admin_update_at`, optional `support_update` enqueue respecting 30-min gap.
   - `support_ticket_resolve(p_id, p_resolution, p_note)` → status resolved, pending ticket SMS → skipped.
   - `support_ticket_release(p_order_id)`, `support_ticket_assign(p_id, p_to)`.
   - `support_enqueue_sms(p_request_id, p_type, p_after)` — internal; applies enabled switch, quiet hours (push to 09:00), gap, max-3-auto cap.
7. Duplicate lead guard: AFTER INSERT trigger on `orders` (lead created): if phone_last9 or cookie_id_hash matches an order with an open operator_flag ticket → set `support_hold=true`, tag `support_duplicate`, add system message "customer submitted new lead #N at hh:mm", bump ticket. Storefront flow unchanged (customer still sees normal success; the lead is real and visible in admin). I'll check the existing `duplicate_order` cancel path during build and keep that separate (it cancels; this only holds).

## Edge functions
- `sms-queue` worker: render support_* from settings texts with `{order}` / `{link}`; skip when ticket resolved or order cancelled; GSM-7 guard; log `sms_logs.type`.
- `_shared/smsTemplates.ts`: support templates + defaults (Deno tests for length ≤160 and GSM-7).
- `order-tracking`: `get` returns `ticket` {status step, admin updates (body/link/video), own comments} — no operator names, no PII; new action `ticket_comment` (≤500 chars, same rate limiter) → message + `last_customer_reply_at`.

## Frontend
- `src/components/admin/IssueFlagButton.tsx` — ghost "⚑ Issue" button + popover (chips, 200-char comment). Placed in `AdminCallQueue.tsx` card and `OrderQuickReviewModal`. Works for phone-only leads.
- `src/pages/admin/AdminIssues.tsx` + nav item "Issues" with open-count badge (all active staff). List sorting: customer replied (unread) → overdue SLA → age. All/Mine filter, optional Assign dropdown.
- `src/components/admin/issues/IssueDrawer.tsx` — thread, Post update (text, link, video URL, status chips, notify ticked), Resolve chips, Release to queue, disabled "Flag customer".
- `src/components/admin/issues/SupportSettingsCard.tsx` (admin settings).
- `src/pages/OrderTracking.tsx` — "Your request" card: 3 steps, updates timeline (link button, video link/embed), comment box. Updates appear via refetch on focus + 30s poll (no realtime for anon).
- `src/lib/supportTickets.ts` — pure rules: working-day SLA, quiet-hour shift, gap/cap decisions, sort order (mirrors SQL, tested).
- `CustomerRequestsPanel` keeps old kinds; shows operator_flag rows as a link to Issues.
- AGENTS.md rule + memory for texts/settings.

## Default SMS texts (sent in Latin, 1 segment each)
- support_ack (ka): "მივიღეთ თქვენი მიმართვა. სპეციალისტი დაგიკავშირდებათ 2 სამუშაო დღეში. დეტალები: {link} TRENDMART"
  sent: `Tqveni mimartva mivighet. Specialisti dagikavshirdebat 2 samushao dgheshi. Detalebi: {link} TRENDMART`
- support_followup (ka): "ჯერ კიდევ ვმუშაობთ თქვენს მიმართვაზე. შეგიძლიათ დაამატოთ დეტალები: {link}"
  sent: `Jer kidev vmushaobt tqvens mimartvaze. Shegidzliat daamatot detalebi: {link} TRENDMART`
- support_update (ka): "თქვენი მიმართვა განახლდა. ნახეთ: {link}"
  sent: `Tqveni mimartva ganakhlda. Nakhet: {link} TRENDMART`

## Risks
- Volume/cost: max 3 automatic + admin updates per ticket, 30-min gap, master switch. Expect ~2 SMS per ticket.
- Segment limit: Latin GSM-7 keeps each ≤160; settings editor shows live char/segment count and blocks non-GSM characters.
- SLA calc: Mon–Fri only, no Georgian public holidays (could add a holiday list later). DST not an issue (Tbilisi has none).
- Hold flag forgotten → lead never called again; mitigated by Issues list + Release button and showing the hold in search.
- Duplicate guard by cookie may hold an unrelated household lead; it is tagged and visible, not cancelled.

## Acceptance tests
- Rolled-back SQL: create ticket → status/is_confirmed/stock unchanged, `support_hold` true, `call_queue_next` never returns it, next_call_after null.
- ack row queued at +5 min; created at 20:58 → send_after 09:00 next day; resolve → pending rows skipped.
- `ticket_comment` via edge function → message in thread, last_customer_reply_at set, ticket sorts first.
- two updates 10 min apart with notify → one support_update SMS, second skipped/delayed per gap.
- new lead same phone → held, tagged, system note on ticket, not in queue.
- Vitest: supportTickets pure rules, isQueueOpen with hold; Deno: template length/GSM-7.

## Open questions
1. Second admin update within 30 min: skip the SMS, or delay it to the end of the gap?
2. When a ticket is resolved, should the lead stay out of the queue (current plan) or return automatically?
3. Duplicate guard: match by cookie too, or phone only (safer)?
4. Approve the three SMS texts above, or change wording?
