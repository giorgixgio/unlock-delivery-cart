# Onway cities and shipment review

## What will change
- Fetch Onway’s cities/regions through the static-IP proxy, preserve the raw response, and store the returned IDs, names and additional fields. Add an admin refresh control; customer forms read the cached list, not Onway directly.
- Use one mobile-friendly searchable city picker across storefront, landing checkout and shipment review. Support Georgian, Latin transliteration and partial searches. Only a selected list entry is accepted; address remains separate. No new prefill or unrelated layout changes.
- Show corrected city/address first in the quick order popup, with original input smaller underneath.
- Add a highlighted, collapsed **Needs review** block and persistent count on the Confirmed tab. Distinguish **Held for review**, **Rejected by Onway** with its error, and **Unclear**.
- Review all blocked orders together with editable city, address, name and phone. Held/rejected orders can be explicitly confirmed and sent by the operator. Unclear orders require an explicit “exists” decision with tracking or “does not exist” decision before a controlled resend.
- Show a batch-result popup with sent/review counts.

## Safety and assumptions
- During implementation and testing, call only read-only Onway endpoints. Never call shipment creation, edit or cancellation. Real send controls remain for you to use.
- Preserve existing sender/payment settings, checkout pricing, tracking, inventory and Excel export behavior.
- Hold only auto-confirmed orders without operator confirmation when risk is not low or normalization confidence is below the existing **0.75** threshold. Missing normalized address/confidence or an unresolved city mapping is unsafe and requires review rather than guessing.
- Do not infer rejection from a timeout, HTTP failure or ambiguous reply. Such shipments remain locked as **Unclear**. Only a clearly documented rejection can permit corrected retry; otherwise an operator must explicitly verify nonexistence. Keep an audit trail and atomic duplicate protection.
- Check returned destination coverage against existing aliases and recent orders. Report common missing villages/districts; never invent destinations or silently map them to a nearby city. If Onway does not supply a usable list, leave the existing customer city entry unchanged and report the blocker rather than disable checkout.

## Technical details
- Add a public-read, service-write `onway_regions` cache with explicit grants and RLS, plus order destination/review metadata and privileged, validated review actions.
- Centralize city search/mapping and review classification so the API batch and Confirmed-tab count use the same rules. Match exact normalized names/aliases uniquely for `to_city_id`; fuzzy search helps people pick but never silently selects a shipping destination.
- Retain the original send claim; controlled retries require server-side authorization, explicit reconciliation and an atomic new attempt claim. Record responses and human decisions without exposing credentials.
- Add focused tests for list-only selection, transliteration/partial search, flagged-auto holds, clear versus ambiguous replies, and retry/lock rules. Verify customer picker and authenticated review using browser checks without sending to Onway.

## Completion report
Report region count and examples, recent auto-confirmed held share with time window and denominator, missing destination coverage, and any checks that could not be completed safely.