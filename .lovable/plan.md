

# Phone-First Landing Order Flow

## Overview

Replace the current full-form checkout on landing pages with a 4-step funnel:
**Landing → Phone popup → Upsell popup → Address popup → Order complete**

This captures the customer's phone immediately (low friction), creates the order, then upsells, then collects delivery details.

## Architecture

```text
Step 1: Phone-Only Popup (modified CODFormModal)
  → Creates order in DB with status "pending_details"
  → phone only, no city/address
  
Step 2: Upsell Popup (new LandingUpsellSheet)
  → "Pick 2 items for 19₾ + free shipping"
  → User selects 0-2 items
  → Updates order_items + shipping_fee in DB
  
Step 3: Address Popup (new AddressFormModal)  
  → Collects city + address
  → Updates order with delivery info
  → Fires tracking events (Purchase, order_submitted)
  → Navigates to /success

Skip/close at step 2 → goes to step 3 with deliveryFee=5
```

## Files to Modify

### 1. `src/lib/orderService.ts`
- Make `city`, `region`, `addressLine1` optional in `OrderInput`
- Add new `updateOrderAddress()` function to patch city/address later
- Add `addUpsellItems()` function to insert additional order_items and update total/shipping

### 2. `src/components/landing/CODFormModal.tsx` — Phone-Only Step
- Remove city and address fields entirely
- Change title to "შეუკვეთე 1 წუთში", subtext "მხოლოდ ტელეფონის ნომერი"
- Button text: "შეუკვეთე"
- On submit: call `createOrder()` with phone only (city/address empty), status `pending_details`
- Show "✔️ შეკვეთა დაფიქსირდა" success flash
- Fire `phone_submitted` tracking event
- Callback: pass order ID to parent → open upsell popup

### 3. New `src/components/landing/LandingUpsellSheet.tsx`
- Bottom sheet/drawer showing product grid
- Hero banner: "აირჩიე ნებისმიერი 2 პროდუქტი მხოლოდ 19₾-ად და მიიღე უფასო მიწოდება"
- Subtext: "დაამატე ახლა და დაზოგე 5₾ მიწოდებაზე"
- Reuses `useProducts()` for catalog, excludes the base product
- Selection state: max 2 items, toggle on/off
- Dynamic total display: base price + upsell items + delivery fee
- If 2 selected: delivery = 0₾ (free), upsell price = 19₾ flat
- Skip button: "შეთავაზების გარეშე გაგრძელება"
- On accept/skip: fire `upsell_accepted`/`upsell_skipped`, call `addUpsellItems()` on DB, then open address popup

### 4. New `src/components/landing/AddressFormModal.tsx`
- Bottom sheet with city + address fields (reuse PredictiveInput, historical data fetch)
- Title: "დაასრულე შეკვეთა"
- Shows order summary with final total
- On submit: call `updateOrderAddress()`, fire Purchase + order_submitted events
- Navigate to `/success`

### 5. Landing page CTAs (all 4 variants)
- **GenericLanding** (`src/pages/ProductLanding.tsx`): Change sticky CTA to open phone-only popup. Text: "შეუკვეთე ახლა"
- **TailoredLanding**: Same — CTA opens phone popup instead of addAndGate
- **WrenchLanding**: Same pattern
- **SpyDetectorLanding**: Already uses CODFormModal — just wired through new flow

Each landing manages local state: `codOpen`, `upsellOpen`, `addressOpen`, `pendingOrderId`, `pendingOrderNumber`, `upsellItems`, `deliveryFee`.

### 6. Price display changes
- Remove "Free Shipping" / "უფასო მიტანა" badges from landing pages
- Show base price only; free shipping is earned via upsell

### 7. Tracking events
Add to `trackEvent` calls at each step:
- `phone_submitted` — after phone popup submit
- `upsell_viewed` — when upsell sheet opens
- `upsell_accepted` — with selected items + saved amount
- `upsell_skipped` — when user dismisses
- `order_completed` — after address submit (fires Purchase pixel too)

## Technical Details

**Order creation flow in DB:**
1. Phone step: `INSERT orders` with `status='pending_details'`, empty city/address, `shipping_fee=5`
2. Upsell step: `INSERT order_items` for upsell products, `UPDATE orders SET shipping_fee=0, total=new_total` if 2 items selected
3. Address step: `UPDATE orders SET city=..., address=..., status='new'`

**No new DB tables needed** — uses existing `orders` + `order_items` tables. The `pending_details` status is just a string value in the existing status column.

**No new contexts needed** — all state is local to each landing page component, passed down via props to the 3 popup components.

