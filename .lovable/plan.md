# Call Queue rules check: last 30 days (Oct 5 – Nov 4)

Based on about 5,900 call results. Nothing has been changed.

## Findings

1. **Speed to first call.** Confirm rate by time from order to first call: <15 min **69%**, 15–60 min **63%**, 1–3 h **65%**, 3–12 h **60%**, 12–24 h **54%**, >24 h **54%**. Calling within 15 minutes gets about 15 points more confirmations than calling the next day.
2. **Value of each attempt.**
   - Of orders confirmed after a no-answer, **79% were confirmed on attempt 2** and **21% on attempt 3**.
   - Customers answer **75%** of first calls, **64%** of second calls and **52%** of third calls.
3. **Retry timing.** The exact scheduled time isn't stored, so I measured the time since the previous call.
   - Attempt 2 made within 3 h (on time): **71%** answered, **42%** confirmed.
   - Attempt 2 made 3–12 h later: **49%** answered, **25%** confirmed.
   - Attempt 3 within 3 h: **26%** confirmed. Attempt 3 made 3–12 h later: **23%** confirmed.
   - So the 2-hour gap works. Being late is what hurts.
4. **Best hours.** Answer rate stays at 72–77% from 10:00 to 15:00, drops to about 67% from 16:00 to 18:00 and to 56% at 19:00. Confirm rate falls steadily over the day: **55% at 10:00**, 49% at 11:00, 42% at 15:00, 29–31% at 17–18. The 11:00 slot is good; 15:00 is weaker.
5. **Night leads (00–07).** First call at 10–12: **61%** confirmed. At 12–17: **54%**. At 17:00 or later (the 18:00 slot): **56%**. The morning beats 18:00.
6. **Max attempts.** Attempt 3 still recovers about 25% of the orders it reaches, so it's worth keeping. About 200 orders got a 4th call (mostly callbacks). Most of them answered, but only **10%** confirmed. A 4th no-answer retry would add little, roughly 1–2% of no-answer orders.
7. **Delivery outcome.** There isn't enough data yet. Only about 270 confirmed orders are linked to a parcel, and most of those parcels haven't finished delivery. Among the few that did, the fast-confirmed ones look fine. I can't make a fair comparison yet; check again in about 2 weeks.

## Verdict: keep the basic rules, change four things

1. **Late retries come first.** A retry that is more than 30 minutes past its time goes ahead of new orders. Otherwise, alternate one new order and one retry. Retries made 3+ hours late confirm about 17 points less (42% vs 25%).
2. **Newest first among new orders.** Fresh leads confirm 69% versus 54% the next day, so call them while they're fresh. Leads older than 24 h will lose a little, but they already convert at about 54% either way.
3. **Night leads in the morning.** Call them from 10:00 and drop the 18:00 slot. The first call goes from about 56% to 61%.
4. **Next-day retry slots: 10:00–11:00 and 14:00**, instead of 11:00/15:00. Afternoon and evening confirm rates are clearly lower.

Keep the **2-hour gap** and the **3-attempt limit**. A 4th attempt isn't worth the calls.

**Expected impact:** about 3–5 more confirmed orders per 100 leads. Most of it comes from calling fresh and on time.

## Technical notes (if approved)
- Change the order inside `call_queue_tier` / `call_queue_next` and keep `callQueuePolicy.ts` matching it, as the project rules require.
- Make the night-lead slot and retry slots settings, so they can be changed later without code.
- Add tests for the new ordering.
