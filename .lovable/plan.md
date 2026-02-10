

## Fetch and Integrate BigMart.ge Product Data (500+ SKUs)

### What We Have

Your Shopify store at bigmart.ge exposes a public JSON API with:
- ~563 products across 14 real collections
- Each product has: id, title, price, images, tags, SKU, variants, description
- Collection endpoints let us map which products belong to which collection

### Collections Found

| Collection | Handle | Product Count |
|---|---|---|
| აბაზანა და სანტექნიკა | აბაზანა-სანტექნიკა | 22 |
| ავტომობილი | ავტომობილი | 45 |
| აქსესუარები | აქსესუარები | 11 |
| ბავშვები | ბავშვები | 33 |
| ბაღი და ეზო | ბაღი-ეზო | 16 |
| განათება | განათება | 22 |
| ელექტრონიკა და გაჯეტები | ელექტრონიკა-გაჯეტები | 13 |
| თავის მოვლა და სილამაზე | თავის-მოვლა-სილამაზე | 50 |
| სამზარეულო | სამზარეულო | 111 |
| სახლი და ინტერიერი | სახლი-ინტერიერი | 51 |
| სპორტი და აქტიური ცხოვრება | სპორტი-აქტიური-ცხოვრება | 24 |
| ხელსაწყოები | ხელსაწყოები | 47 |

### Implementation Plan

#### Step 1: Fetch all products at build time

I will fetch products from your store's public API across all pages:
- `bigmart.ge/products.json?limit=250&page=1` (first 250)
- `bigmart.ge/products.json?limit=250&page=2` (next 250)
- `bigmart.ge/products.json?limit=250&page=3` (remaining)

For collection mapping, I will fetch each collection's product list from:
- `bigmart.ge/collections/{handle}/products.json`

#### Step 2: Create a product data module

Replace `MOCK_PRODUCTS` in `src/lib/constants.ts` with real data. The new product type will include:

```text
Product {
  id: string
  title: string
  price: number
  compareAtPrice: number | null
  image: string (primary image URL)
  images: string[] (all image URLs)
  category: string (collection handle)
  tags: string[]
  sku: string
  available: boolean
  description: string
  vendor: string
  handle: string
}
```

Since 500+ products is too large for a single constants file, I will create a separate `src/data/products.ts` file.

#### Step 3: Update categories

Replace the current hardcoded `CATEGORIES` array with your real Shopify collections (the 12 real ones above, plus an "all" option).

#### Step 4: Update components

- **ProductCard**: Update to use new product fields (real images from Shopify CDN, real prices)
- **BoosterRow**: Filter based on real product prices
- **Index page**: Use real categories from collections
- **Cart**: Works as-is since it references the Product type

### Technical Details

- Product data will be statically embedded in the bundle (no runtime API calls needed)
- Shopify CDN image URLs will be used directly (fast, cached)
- The `CategoryId` type will be updated to match real collection handles
- Products belonging to multiple collections will use their primary/first collection

### What You Will Get

- All ~563 real products from BigMart.ge displayed in the store
- Real collection-based category filtering
- Real product images, prices, tags, and SKUs
- Everything else (cart, delivery threshold, COD flow) continues working as before

