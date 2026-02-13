

## Out-of-Stock System: Admin Toggle + Beautiful Shop Experience

### What this does

1. **Admin: Toggle products out of stock** -- add a clickable status badge in the product table that toggles `available` on/off (persisted in localStorage so it survives page reloads). Currently the "Active/Draft" badge is display-only.

2. **Shop page: When hero product is out of stock** -- instead of hiding it or showing an ugly error, display it as a premium "discovery" landing with a beautiful "JUST SOLD OUT" badge, greyed-out image overlay, and disabled add-to-cart. The section label changes to "Discover similar products" so it feels like an opportunity, not a dead end.

3. **Regular grid cards: out-of-stock treatment** -- show a subtle "Sold Out" overlay on the image with disabled buttons, but keep the card visible and tappable (ProductSheet still opens).

4. **Ranking engine: prioritize relevant products when hero is OOS** -- currently the engine filters out `available === false` products from related/trending. When the hero is OOS, the related section should STILL use the hero's category/tags to surface the most relevant alternatives first, and the section label should reflect discovery intent.

---

### Technical Changes

**File: `src/pages/admin/AdminProducts.tsx`**

- Add localStorage-backed `stockOverrides: Record<string, boolean>` state (key: `bigmart-stock-overrides`)
- Make the "Active/Draft" badge clickable -- clicking toggles the product's availability in the override map
- Show a small indicator count in the header: "X products marked out of stock"
- Add an "Out of Stock" tab filter alongside "All" and "Conflicts"

**File: `src/hooks/useProducts.ts`**

- After mapping products, apply stock overrides from localStorage before returning
- This ensures the entire app sees the correct `available` status without any Shopify writes

**File: `src/components/HeroProductCard.tsx`**

- Check `product.available` -- if false:
  - Add a semi-transparent dark overlay on the image
  - Show a large, premium "JUST SOLD OUT" badge (white text on dark glass background, slight blur)
  - Hide the add-to-cart button area
  - Keep the card tappable (ProductSheet still opens for browsing)
  - Change border from primary glow to a muted/elegant style

**File: `src/components/ProductCard.tsx`**

- Check `product.available` -- if false:
  - Add a subtle dark overlay on the image with small "Sold Out" text
  - Disable the add-to-cart button (show greyed out "Sold Out" instead)
  - Keep card tappable for ProductSheet

**File: `src/pages/Shop.tsx`**

- When `heroProduct` exists and `heroProduct.available === false`:
  - Still show the hero card (HeroProductCard handles the sold-out display)
  - Change the "related" section label to "აღმოაჩინე მსგავსი" (Discover similar)
  - Remove the current fallback "product not found" message for OOS heroes (it's not "not found", it's sold out)

**File: `src/lib/rankingEngine.ts`**

- In `getRelated()`: allow the hero itself to be unavailable (don't filter hero from input), but still filter unavailable items from the candidates list
- In `rankingEngine()`: when hero is present but unavailable, still use it for related scoring -- just don't include unavailable items in the results (except the hero itself in position 0)
- This ensures users landing on an OOS product link see the most relevant alternatives immediately

---

### What does NOT change

- No Shopify API writes
- No database writes
- No changes to cart logic, pricing, or checkout
- The ranking engine still filters out OOS products from trending/weighted/related results (only the hero position shows an OOS product)
- Stock overrides are admin-local (localStorage) -- purely for demo/management purposes
