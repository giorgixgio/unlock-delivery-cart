# Multi-category product classification (AI-assisted)

## Current state

491 products, each with exactly one `category` column value:

| Category | Products |
|---|---|
| სამზარეულო | 119 |
| აქსესუარები | 68 |
| uncategorized | 59 |
| თავის-მოვლა-სილამაზე | 56 |
| ავტომობილი | 45 |
| ხელსაწყოები | 34 |
| სახლი-ინტერიერი | 27 |
| ბავშვები | 24 |
| სპორტი-აქტიური-ცხოვრება | 23 |
| ბაღი-ეზო | 17 |
| აბაზანა-სანტექნიკა | 11 |
| განათება | 7 |
| ელექტრონიკა-გაჯეტები | 1 |

Categories today come from a keyword match on Shopify tags + title (in `sync-products` and mirrored in `useProducts`). The storefront chip filter compares one category per product, so a product can never appear in two chips.

## What gets built

### 1. New categories

Add five categories the uncategorized bucket clearly needs:
- შინაური ცხოველები (pets)
- კემპინგი & ტურიზმი (camping/outdoor)
- უსაფრთხოება & სპეცტანსაცმელი (safety/workwear)
- ჩანთები & ორგანაიზერები (bags/storage)
- თამბაქოს აქსესუარები (smoking accessories)

They appear as new chips on the shop grid with Georgian/English labels.

### 2. Multi-category storage

New table `product_categories`: one row per product-category pair, with a flag marking the primary category, plus the source (`ai` / `rules` / `manual`) and a confidence score. Products keep their existing single `category` column as the primary, so nothing that reads it today breaks.

### 3. AI classification pass

An admin-only backend function walks the catalog in batches and, for each product, sends the title, description snippet, tags and the product image to an AI model, asking it to pick 1-3 categories from the fixed list plus one primary. Results are written to `product_categories`, and the primary is mirrored back into `products.category`. Existing rule-based categories are given to the model as a hint, not as a hard answer, so an obviously wrong one can be corrected.

Run manually from the admin Products page ("Reclassify categories" button), with progress and a summary (products classified, per-category counts, multi-category count). It is re-runnable and does not overwrite categories that were set manually.

### 4. Storefront + admin wiring

- Shop grid category chips filter on the full category set, so a car phone-holder shows under both ავტომობილი and აქსესუარები.
- Admin product view shows the assigned categories with the ability to add/remove one by hand (marked `manual` so re-runs leave it alone).
- After the run I'll send you the final category → product-count table, including the overlap count.

## Technical notes

- Migration: `public.product_categories (product_id text references products(id) on delete cascade, category text, is_primary bool, source text, confidence numeric, created_at)`, unique on `(product_id, category)`, with GRANTs (`select` to anon + authenticated, full to authenticated/service_role) and RLS: public read, writes admin-only via `is_active_admin`.
- Edge function `classify-product-categories`: admin JWT check like `sync-products`, service-role writes, batches of ~15 products per model call, image passed as an `image_url` block. Model: `google/gemini-3.1-flash-lite` via the AI gateway (multimodal, cheap for ~491 items); strict JSON schema output restricted to the allowed category enum. Products whose category rows are `manual` are skipped.
- `src/lib/constants.ts`: add the 5 new category ids to `CATEGORIES`; `Product` gains `categories: string[]`.
- `src/hooks/useProducts.ts`: join `product_categories` into the product map, populate `categories` (fallback to `[category]`), bump the localStorage cache key.
- `src/pages/Index.tsx` and `src/pages/Shop.tsx`: filter with `categories.includes(activeCategory)`; add the new label keys to `LanguageContext`.
- `sync-products` keeps its keyword rules for brand-new products only (a first-pass primary), which the classifier then refines.
