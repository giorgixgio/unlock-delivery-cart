

# Fix: Popup Add Tracking Consistency

## Problem
The SoftCheckoutSheet (popup) has two add paths:
1. **Direct "დამატება" button** on `SheetProductCard` → calls `addAndGate(product, "popup")` → fires both `product_added` and `popup_item_added` ✅
2. **Tap product card → opens nested `ProductSheet`** → adds use `"pdp_quick_order"` or `"pdp_sheet"` → fires only `product_added`, misses `popup_item_added` ❌

## Root Cause
`SoftCheckoutSheet` renders a nested `<ProductSheet>` (line 293). When a user taps a card to preview, then adds from the sheet, the `ProductSheet` component has no awareness it was opened from the popup context. It passes its own source strings to `addAndGate`.

## Fix
Pass a callback or context flag from `SoftCheckoutSheet` to the nested `ProductSheet` so adds from that sheet also use `source: "popup"`.

Concretely:
1. **Add an `onAdd` callback prop to `ProductSheet`** that `SoftCheckoutSheet` provides
2. When `ProductSheet` is opened from the popup, the `onAdd` callback will call `addAndGate(product, "popup")` instead of the default sources
3. Alternatively (simpler): add an optional `sourceOverride` prop to `ProductSheet`. When set, all add actions inside use that source instead of their defaults.

### Approach: `sourceOverride` prop on ProductSheet

**`src/components/ProductSheet.tsx`**
- Add optional `sourceOverride?: string` prop
- In `handleQuickOrder`: use `sourceOverride ?? "pdp_quick_order"` as source
- In quantity `+` button: use `sourceOverride ?? "pdp_sheet"` as source

**`src/components/SoftCheckoutSheet.tsx`**
- Pass `sourceOverride="popup"` to the nested `<ProductSheet>` (line 293)
- Update `addedDuringSession` tracking: the nested sheet's adds should also increment this counter — add an `onAdd` callback that increments `addedDuringSession.current`

### Files Changed
- `src/components/ProductSheet.tsx` — add `sourceOverride` prop, apply to both add handlers
- `src/components/SoftCheckoutSheet.tsx` — pass `sourceOverride="popup"` and `onAdd` to nested ProductSheet

### What stays unchanged
- Grid card adds (`"grid"`)
- Direct popup button adds (`"popup"`) — already correct
- `addAndGate` logic in `CheckoutGateContext` — no changes needed, it already checks `src === "popup"`

