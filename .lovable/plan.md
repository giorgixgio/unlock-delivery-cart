
## Fix: Admin Orders Visibility Gaps and Checkout Consistency

### Investigation Results

After checking the full database:
- All 161 orders exist and are accounted for
- Order sequence is at 100283 -- no orders were created or lost after that
- No failed ORDER_CREATE events today
- The Meta Pixel "sale" is most likely order 100283 itself (confirmed, visible in "Ready" tab, not "Needs Review")
- The dashboard shows 20 live orders today (1 confirmed + 19 shipped), not 2 -- the "2" you saw might be from a specific card like "Needs Review" or "New"

### Real Bugs Found (would cause invisible orders)

**Bug 1: `pending_bump` orders are invisible in admin**
The CODFormModal (landing page checkout) creates orders with `status: "pending_bump"` when bump offers are enabled. The admin Orders page has 5 tabs: Review, Ready, Fulfilled, Merged, Canceled -- NONE of them match `pending_bump`. If a customer abandons the bump modal, that order becomes a ghost: it exists in the DB, the Pixel fires, but you'll never see it in admin.

**Bug 2: CODFormModal bypasses stock checks**
The landing page COD form creates orders with a raw Supabase insert, completely skipping the `createOrder()` function and its server-side OOS (out-of-stock) check. A customer could order an out-of-stock product from a landing page.

**Bug 3: No "All Orders" view**
There's no way to see every order regardless of status. If any order has an unexpected status, it vanishes from the UI.

### Changes

**1. Add `pending_bump` to the Review tab filter** (`src/pages/admin/AdminOrders.tsx`)
- Include `pending_bump` in the review tab's OR filter so these orders appear in "Needs Review"
- Include `pending_bump` in the review count query
- This ensures bump-abandoned orders are always visible

**2. Add an "All" tab** (`src/pages/admin/AdminOrders.tsx`)
- Add a 6th tab "All" that shows every order (except merged) sorted by date
- This acts as a safety net -- no order can ever be invisible again

**3. Refactor CODFormModal to use shared `createOrder()`** (`src/components/landing/CODFormModal.tsx`)
- Replace the inline Supabase insert with a call to `createOrder()` from `orderService.ts`
- This adds stock checks, consistent error logging, and the same code path as the main checkout
- Handle `pending_bump` status by setting it after order creation if bump is enabled

**4. Fix dashboard "Needs Review" to match Orders page logic** (`src/pages/admin/AdminDashboard.tsx`)
- Include `pending_bump` in the needs-review filter
- This keeps dashboard counts consistent with the orders page

### Technical Details

Review tab filter change (AdminOrders.tsx):
```text
Current: .or("status.in.(new,on_hold),is_confirmed.eq.false,review_required.eq.true")
New:     .or("status.in.(new,on_hold,pending_bump),is_confirmed.eq.false,review_required.eq.true")
```

New "All" tab query:
```text
.neq("status", "merged")
.order("created_at", { ascending: false })
```

CODFormModal refactor: import and call `createOrder()` instead of raw insert, then update status to `pending_bump` if bump is enabled.
