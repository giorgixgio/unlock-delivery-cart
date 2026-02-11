
# Cart Overlay Navigation Fix

## Problem
Cart is a separate route (`/cart`). When users press browser back from cart, they land on `/` (home) instead of returning to `/shop?product_id=...`. The cart header back button is hardcoded to `navigate("/")`.

## Root Causes
1. **Cart back button hardcoded to home**: `Cart.tsx` line 233 uses `navigate("/")` instead of going back in history
2. **Cart is a full route**: Opening cart pushes `/cart` onto the history stack, so back goes to the previous entry (which may be `/` if the user came from there originally)
3. **No scroll position preservation**: After navigating away and back, scroll resets

## Solution

Convert the cart from a route-based page to a **full-screen overlay** rendered on top of the current page, integrated with browser history via `pushState`/`popstate`.

### Architecture

```text
Before:  /shop?product_id=X  -->  navigate("/cart")  -->  back  -->  "/"
After:   /shop?product_id=X  -->  pushState(overlay:cart)  -->  back  -->  popstate closes overlay
```

### Step-by-step

**1. Create CartOverlayContext** (`src/contexts/CartOverlayContext.tsx`)
- Manages `isCartOpen` state
- `openCart()`: saves `scrollY`, calls `history.pushState({ overlay: "cart" }, "", location.href)`
- `closeCart()`: restores scroll position, calls `history.back()` if history state has overlay marker
- Listens to `popstate` event: if overlay was open and state no longer has marker, close the cart UI
- Supports deep-link: on mount, check URL for `?cart=1` param and auto-open

**2. Refactor Cart.tsx to CartOverlay component**
- Render as a full-screen fixed overlay (`fixed inset-0 z-50 bg-background overflow-y-auto`) instead of a `<main>` routed page
- Replace `navigate("/")` back button with `closeCart()` from context
- Replace `navigate("/success", ...)` with normal navigation (close overlay first)
- Keep all existing checkout form logic unchanged
- The unlock gate check redirects using `closeCart()` instead of `navigate("/")`

**3. Update App.tsx routing**
- Remove the `/cart` route from `<Routes>`
- Render `<CartOverlay />` alongside `<StickyCartHUD />` (always mounted, visibility controlled by context)
- Wrap with `<CartOverlayProvider>`

**4. Update all cart navigation entry points**
- `StickyCartHUD.tsx`: change `handleCheckoutIntent` flow to call `openCart()` instead of navigating to `/cart`
- `CheckoutGateContext.tsx`: change `proceedToCheckout` from `navigate("/cart")` to `openCart()`
- `SoftCheckoutSheet.tsx`: change `handleViewCart` from `navigate("/cart")` to `openCart()`
- `ProductSheet.tsx`: update finalize handler

**5. Scroll position preservation**
- Before opening cart, store `window.scrollY` in the context
- On close, restore scroll via `window.scrollTo(0, savedScrollY)`
- Use `requestAnimationFrame` for reliable restoration after DOM settles

**6. Deep link support**
- If URL contains `?cart=1`, auto-open cart overlay on mount
- On close, strip `cart=1` from URL using `replaceState`

### What stays unchanged
- All cart business logic (items, form, order submission, validation)
- Cart UI and styling (just wrapped differently)
- Product grid, ranking engine, infinite scroll
- SoftCheckoutSheet and ProductSheet behavior
- Admin routes

### Files to create
- `src/contexts/CartOverlayContext.tsx`

### Files to modify
- `src/pages/Cart.tsx` - convert from page to overlay component
- `src/App.tsx` - remove `/cart` route, add overlay + provider
- `src/contexts/CheckoutGateContext.tsx` - use `openCart()` instead of `navigate("/cart")`
- `src/components/StickyCartHUD.tsx` - use `openCart()` for direct cart access
- `src/components/SoftCheckoutSheet.tsx` - update `handleViewCart`
- `src/components/ProductSheet.tsx` - update finalize flow

### Edge cases handled
- iOS swipe-back gesture triggers `popstate` which closes cart (same as back button)
- Multiple overlays: popstate handler checks if cart is the active overlay before acting
- Direct URL `/cart` (legacy): add a redirect route to open overlay via `?cart=1`
- Order success: close overlay, then navigate to `/success`
- Cart threshold gate: close overlay with toast instead of navigating to home
