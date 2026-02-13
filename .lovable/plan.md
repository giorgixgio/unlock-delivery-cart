
## Fix: Fetch All 490 Products and Categorize by Tags

### Problem
Currently fetching only **334 of ~490 products** because:
1. The code fetches from 12 named collections individually, but some products don't belong to any of them
2. A duplicate collection `სამზარეულო-1` (111 products) is not in the fetch list
3. Shopify's `/collections/all` endpoint contains ALL products but isn't being used

### Solution

**Change the fetching strategy in `src/hooks/useProducts.ts`:**

Instead of fetching 12 collections in parallel and deduplicating, fetch directly from `/collections/all/products.json` (pages 1 + 2) to get all ~490 products in just 2 requests (faster too).

**Categorize using tags instead of collection handles:**

Each product has tags like `["სამზარეულო", "სამზარეულოს აქსესუარები", "შესანახი"]`. Build a tag-to-category mapping:

| Tag keyword match | Category assigned |
|---|---|
| `სამზარეულო` | სამზარეულო |
| `მანქანა`, `ავტო` | ავტომობილი |
| `სილამაზე`, `თავის მოვლა`, `კანი` | თავის-მოვლა-სილამაზე |
| `სპორტი`, `ფიტნესი` | სპორტი-აქტიური-ცხოვრება |
| `ბავშვ` | ბავშვები |
| `ბაღი`, `ეზო` | ბაღი-ეზო |
| `აბაზანა`, `სანტექნიკა` | აბაზანა-სანტექნიკა |
| `განათება`, `ნათურა`, `ლამპა` | განათება |
| `ელექტრონიკა`, `გაჯეტ` | ელექტრონიკა-გაჯეტები |
| `ხელსაწყო` | ხელსაწყოები |
| `აქსესუარ` | აქსესუარები |
| `სახლი`, `ინტერიერი` | სახლი-ინტერიერი |
| No match | uncategorized (still shown under "all") |

Priority order matters -- e.g., "სამზარეულოს აქსესუარები" should match "სამზარეულო" before "აქსესუარები".

### Technical Changes

**File: `src/hooks/useProducts.ts`**

1. Replace `fetchCollectionProducts` + parallel collection fetching with a simpler `fetchAllFromShopify` that paginates through `/collections/all/products.json`
2. Add a `categorizeByTags(tags: string[], title: string): string` function that maps product tags to category IDs using the priority table above
3. Also check the product title as fallback if no tag matches
4. Update `mapShopifyProduct` to accept tags-based category instead of collection handle
5. Add the `product_type` field from Shopify response to the Product interface (store it even if empty -- useful later)
6. Store `collections` info if needed by also building a reverse map from the parallel collection fetches (optional, tags alone should cover 95%+)

**File: `src/lib/constants.ts`**

- Add an "uncategorized" category entry so products without tag matches still appear
- Optionally add `productType` to the Product interface

**No other files need changes** -- the rest of the app uses the same `useProducts()` hook and `Product` interface.

### Performance
- Current: 12+ parallel requests (one per collection, some paginated)
- New: 2 sequential requests (page 1 + page 2 of "all"), much faster
- localStorage cache remains the same

### Risk
- Zero risk to cart, pricing, checkout, or backend -- only the product fetch layer changes
- Category filter chips on the Index page will now show more products per category
- Products that had no category before will now be categorized by tags
