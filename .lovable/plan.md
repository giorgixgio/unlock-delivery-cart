# Returns from a new lead — how it works today, and a simpler flow

## What happens today (checked in the code and live data)

1. **Which order is used for the return:** the order that is currently open, which is **the new lead**. Nothing looks up the customer's old delivered order, and the operator can't pick one. The return is marked "from #<new lead>", so the link points to the wrong order. In the data, 4 return records already point at a lead or a cancelled order instead of a delivered one.
2. **What happens to the new lead:** nothing. It stays open in the queue with its status and call history unchanged. Someone then has to cancel it by hand, using any cancel reason; there is no "converted to return" reason.
3. **Link between the lead and the old order:** none. The only link saved is return → the order it was created from (the lead). The old delivered order is never linked.
4. **Courier and stock:** a separate return order is created with status "return review", the lead's address, its items copied, price 0 and the note "გაცვლა". After an admin presses Approve, it goes to Onway as a normal parcel with "RETURN —" added to the note. There is no special pickup type, so whether the courier collects the old item depends on the note. Stock: confirming a return does not reduce stock. There are still 30 stock entries tied to return orders, probably from the packing/sending step; I haven't confirmed this. No step puts the returned item back into stock.
5. **Several delivered orders, or different products:** the system doesn't handle this. It always copies the open lead's items, which may not be what was delivered. The operator has to remember the old order and edit the items by hand.
6. **Where it goes wrong:**
   - The lead stays in the queue, so it gets called again or is cancelled with a random reason. This lowers operators' confirm rates.
   - The return points at the lead, so courier stats can't connect it to the real delivery.
   - Nobody can see a single "return from #old" history.
   - An operator can create a return and also confirm the lead. That sends two parcels and can take stock twice.

## Proposed simple flow (only if you approve)

**Return**
1. On a lead, "Make Return" opens a list of this customer's **delivered orders**, newest first (same phone matching as the history panel), showing date, number and products. If there's only one, it's already selected.
2. The operator ticks the items and quantities being returned, then picks a reason: broken / wrong item / didn't like / other.
3. One button: **"Create return"**. In a single safe step, the system:
   - creates the return on the **old delivered order** (linked to it), with the return items;
   - closes the new lead with status "canceled" and the reason **"converted to return"**. It is linked to the return, takes no stock, is not counted as a cancel in operator stats, and leaves the queue;
   - writes a history entry on all three orders with who did it and when.
4. The courier gets the return as a pickup ("RETURN — pick up: items…"). When the parcel arrives back at the warehouse, the returned items are added back to stock (or marked as damaged and not added back).

**Exchange**
- Same screen with a toggle: **"Return + send replacement"**. The operator picks replacement products, which default to the same items.
- A single courier job handles both: the courier delivers the new item and picks up the old one. Replacement stock is taken when it's sent. The price is 0, or only the difference if the replacement costs more.

**Safety**
- If the customer has no delivered orders, the button shows "No delivered order to return" and the operator handles it as a normal lead.
- The lead can't be both confirmed and converted.
- Admins keep the current Approve step before anything goes to Onway.

## Questions for you
- Should returned items go back into stock automatically when they arrive, or only after someone checks them?
- Exchange price difference: charge it at the door, or always free?

## Technical notes
- New staff-only RPC `create_return_from_lead(lead_id, original_order_id, items, reason, replacement_items?)`. It runs in a single database transaction: it inserts the return, sets the lead to `canceled` with `final_cancel_reason='converted_to_return'`, adds a new link column `return_order_id` to the lead, writes the history entries, and releases the queue lock.
- Operator stats and the queue exclude `converted_to_return` from cancel counts.
- `CreateReturnModal` gets a step for choosing the delivered order (reusing `operator_customer_history`).
- Restocking happens on the Onway "returned to warehouse" status update, through a once-only stock function.
- Add tests for the convert rules and for excluding conversions from stats.
