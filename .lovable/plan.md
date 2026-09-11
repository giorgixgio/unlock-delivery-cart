# Move the catalog to BigMart

## What will change
- Reassign every current TrendMart product to BigMart, except SKUs `002`, `0011`, and `0012`, which remain on TrendMart.
- Keep direct `/p/...` product landing links available regardless of which storefront owns the product.
- Keep homepage, shop, recommendations, and upsell lists restricted to the visitor’s storefront, so moved products disappear from TrendMart and appear on BigMart.
- Refresh the storefront product cache version so visitors see the new assignment immediately instead of waiting for an older cached catalog to expire.

## Safety and verification
- Preserve all product IDs, handles, prices, stock, landing settings, and order history; only the store assignment changes.
- Verify the three excluded SKUs remain assigned to TrendMart and all other products are assigned to BigMart.
- Verify `/p/...` still reads from the complete catalog, while storefront lists continue using store-filtered products.
- Run focused checks and inspect both storefront modes after the update.

## Technical details
- Store ownership uses `products.warehouse`: `A` is BigMart and `B` is TrendMart.
- This is a data update, not a schema migration.
