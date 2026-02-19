
# Restore Products from Database (No Shopify Dependency)

## Problem
The site shows zero products because it fetches everything live from Shopify, which is currently down (402 Payment Required). There is no local copy of the full catalog.

## What We Have
- **89 unique products** stored in the `order_items` table from past orders (title, price, image, SKU, product_id)
- This is enough to restore the storefront immediately with all previously-ordered products

## Plan

### Step 1: Create a `products` table
A new database table to hold the product catalog locally:
- id, title, handle, description, vendor, sku, price, compare_at_price
- image, images (array), category, tags, available
- synced_at, created_at
- Public read access (RLS), admin-only write access

### Step 2: Seed from existing order data
Populate the products table using the 89 products already in `order_items`:
- Extract distinct product_id, title, unit_price, image_url, sku, tags
- Set all as available by default
- Auto-categorize using the existing tag-to-category logic

### Step 3: Update `useProducts` hook
Change from fetching Shopify API to querying the local database:
- `SELECT * FROM products` instead of hitting Shopify
- Keep existing stock override logic unchanged
- Keep localStorage cache for fast loading

### Step 4: Create `sync-products` edge function
For when Shopify comes back online:
- Fetches full catalog from Shopify API
- Upserts all ~490 products into the local table
- Can be triggered from admin panel

### Step 5: Add "Sync from Shopify" button in Admin
- Button on the Products admin page
- Calls the sync edge function
- Shows last sync timestamp and product count

## Result
- Site works immediately with 89 products (no Shopify needed)
- When Shopify subscription is reactivated, one click syncs the full ~490 catalog
- Shopify is never called at runtime again -- only for background sync

## Technical Details

### Database schema
```sql
CREATE TABLE public.products (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  handle text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  vendor text NOT NULL DEFAULT '',
  sku text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  compare_at_price numeric,
  image text NOT NULL DEFAULT '/placeholder.svg',
  images jsonb NOT NULL DEFAULT '[]',
  category text NOT NULL DEFAULT 'uncategorized',
  tags text[] NOT NULL DEFAULT '{}',
  available boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Seed query (from order_items)
```sql
INSERT INTO products (id, title, price, image, sku, tags, available)
SELECT DISTINCT ON (product_id)
  product_id, title, unit_price, image_url, sku, tags, true
FROM order_items
WHERE product_id != ''
ON CONFLICT (id) DO NOTHING;
```

### Files to modify
- `src/hooks/useProducts.ts` -- read from database instead of Shopify
- `src/pages/admin/AdminProducts.tsx` -- add Sync button

### Files to create
- `supabase/functions/sync-products/index.ts` -- Shopify sync edge function
