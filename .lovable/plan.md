# Courier Dispatch Agent — one-message fulfilment run

Goal: you send one message ("dispatch today's orders"), and the system prepares the courier batch, cleans bad cities, shows you one approval screen, sends the batch to the courier, then pulls tracking numbers back into the dashboard automatically.

## Short answer to your question

Doing this by driving the courier website like a robot (logging in, clicking, uploading, downloading) is genuinely painful: it breaks every time they change a button, it needs an always-on office PC with a real browser, and logins/2FA constantly interrupt it. You said the cloud-only route is what you want and that API access is available — that settles it. **Go the API route.** Everything then runs on our side with no browser, no office PC, no fragile clicking.

One thing to confirm with the courier before we build: their API must cover three things — create/submit a shipment batch, read back rejection reasons, and read back tracking numbers. If their API only does the first, we still pull tracking through the existing file import you use today.

## How the run works

```text
your message  ->  1. collect orders ready to ship
                  2. clean cities (existing City QA rules)
                  3. build the batch
                  4. APPROVAL SCREEN  <- you tap Send
                  5. submit to courier
                  6. rejected rows: auto-fix city/address, resubmit once
                                    anything else -> flagged list for you
                  7. pull tracking numbers, write onto the orders
                  8. summary back in chat + a run log page
```

Nothing reaches the courier before you tap Send. Steps 5–8 run on their own after that.

## What gets built

1. **Courier API connection** — the credentials are stored securely on the server, never in the app. A single place that talks to the courier: submit batch, check batch status, fetch tracking.
2. **Dispatch run record** — every run is saved: which orders, what was auto-corrected, what the courier rejected, what tracking came back. So you can always see what happened and when.
3. **Approval screen** — a new admin page showing the pending run: order count, list of cities we corrected (old → new), rows we could not resolve, and Send / Cancel. Unresolvable rows are held back from the batch rather than blocking the whole run.
4. **Error handling** — rejections that are city or address problems get auto-corrected with the City QA rules and resubmitted one time. Any other rejection (missing phone, duplicate, courier-side error) is listed for you to fix by hand, then re-run for just those.
5. **Tracking return** — tracking numbers land on the orders automatically and orders move to fulfilled, using the same rules the current file import uses, so nothing downstream changes.
6. **Trigger** — a Dispatch button in the admin panel plus a scheduled daily run that stops at the approval screen. A chat-style trigger can be added later once the run itself is proven.

## Technical notes

- New edge functions: `courier-dispatch-prepare` (reuses `export-courier` row-building and `src/lib/cityQa.ts`), `courier-dispatch-submit`, `courier-dispatch-poll` (scheduled, fetches statuses + tracking, reuses `import-courier` write logic).
- New tables: `courier_dispatch_runs` and `courier_dispatch_rows` (order id, submitted payload, corrections applied, courier status, rejection reason, tracking number), admin-only RLS + grants.
- Courier credentials stored as project secrets; no key touches the browser.
- Existing `export-courier` / `import-courier` / `OrdersExportModal` stay working untouched — the agent path is additive, so manual export remains the fallback.
- Polling via a scheduled job every few minutes while a run is open; runs auto-close when all rows have a final status.

## Open item before build

I need the courier's API documentation (endpoints, auth method, and whether tracking is readable via API). If tracking is not exposed, step 7 falls back to their file export and I'll wire that instead — the rest of the plan is unchanged.
