# Stockout Demand Tracking

Capture phone-submit attempts on out-of-stock products as a separate signal — no real order, no Purchase pixel, but full attribution preserved so I can find Meta ads still running on sold-out SKUs.

## 1. Database

New table `public.stockout_attempts`:

- `id`, `created_at`
- `product_id`, `sku`, `product_name`, `variant_id`
- `phone_number`, `phone_normalized` (for dedup)
- `quantity_attempted` (default 1)
- `landing_page_url`, `source` (`landing`/`shop`/`product_sheet`)
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `meta_campaign_id`, `meta_adset_id`, `meta_ad_id`, `fbclid`
- `user_agent`, `session_id`, `ip_country` (best-effort, nullable)
- `attempt_count` (int, default 1 — incremented on dedup hit)
- `last_attempt_at`
- `status` enum: `unresolved` | `reviewed` | `ad_turned_off` | `restock_needed` | `ignored`
- `reviewed_by`, `reviewed_at`, `note`
- `waitlist_requested` boolean

Indexes: `(product_id, last_attempt_at desc)`, `(status, last_attempt_at desc)`, `(phone_normalized, product_id, last_attempt_at)`.

RLS + GRANTs:
- `anon` + `authenticated`: `INSERT` only (the landing-page submit comes through publishable key).
- Admin reads/updates via `is_active_admin(auth.uid())` policy.
- `service_role`: ALL.

RPC `record_stockout_attempt(p_product_id, p_sku, p_phone, p_payload jsonb)`:
- Normalizes phone, looks for row with same `(phone_normalized, product_id)` in last 24h.
- If found → `UPDATE` set `attempt_count = attempt_count + 1`, `last_attempt_at = now()`, merge missing attribution fields.
- Else → `INSERT` new row.
- Returns `{id, deduped: bool, attempt_count}`.
- `SECURITY DEFINER`, callable by anon/authenticated.

## 2. Landing-page submit flow

In `CODFormModal.handleSubmit` (and the matching path in `TailoredLanding` / `SpyDetectorLanding` / `WrenchLanding` if they don't go through CODFormModal), before `createOrder`:

1. Read stock via existing `stockOverrideStore` + product availability.
2. If **in stock** → unchanged: `createOrder(...)`, fire Lead/Purchase as today.
3. If **out of stock**:
   - Collect attribution from URL params (`utm_*`, `fbclid`) + `sessionStorage` (already stored by funnel tracking).
   - Call `record_stockout_attempt` RPC.
   - Fire **only** `OutOfStockAttempt` custom Meta event (no Purchase, no Lead).
   - Replace success/upsell flow with a `StockoutMessageView` overlay inside the same modal:
     - Title `მარაგი დროებით ამოიწურა`
     - Body `მადლობა ინტერესისთვის...`
     - Buttons: `სხვა პროდუქტების ნახვა` (→ `/`) and `შეტყობინება მარაგის დაბრუნებისას` (toggles `waitlist_requested=true` via small update RPC).
   - Do NOT navigate to OrderSuccess; do NOT open upsell sheet.

No changes to `createOrder`, `orders` table, courier export, or revenue math.

## 3. Meta pixel

In `src/lib/metaPixel.ts` add `trackStockoutAttempt(payload)` that calls `fbq('trackCustom', 'OutOfStockAttempt', {...})`. Used only by the stockout branch.

## 4. Admin: Stockout Demand page

New route `/admin/stockout-demand` (sidebar entry under Operations).

Top cards (today):
- Total attempts
- Unique phones
- Distinct products
- Top stockout product
- Estimated lost revenue = `Σ unique_attempts_per_product × product.price`

Table (one row per product, aggregated):
- Image, name, SKU, current stock
- Attempts today / unique phones today
- Attempts last 7 days
- Estimated lost revenue
- Last attempt time
- Top UTM/campaign (most common `meta_campaign_id` or `utm_campaign`)
- Status (worst-of among unresolved rows)
- Actions: Mark reviewed / Ad turned off / Restock needed / Ignore / Open product / Copy SKU

Row click → drawer with raw attempts (phone masked last 4, full attribution per attempt).

## 5. Alert logic

Threshold: ≥3 unique phones in 1h OR ≥5 unique phones in 24h, against a SKU whose current stock = 0.

- Computed client-side from the same query that feeds the table.
- Main `AdminDashboard` gets a small warning card **Stockout Demand Alerts** (amber) showing count of SKUs over threshold; click → `/admin/stockout-demand?filter=alerts`.
- Inside the page, alert rows pinned to top with red border + the suggested-action copy.

## 6. Product detail integration

On admin product page, add a small "Stockout signal" block:
- Attempts today, attempts last 7d, est. lost revenue, last attempt timestamp.

## 7. What stays unchanged

- `orders` table, RLS, revenue calculations, courier export, packing waves.
- Existing stock display on the landing page (still doesn't show sold-out upfront).
- Phone submit flow when product is in stock (Lead + Purchase fire as today).
- `createOrder`, `addUpsellItems`, address flow.

## Out of scope for this pass

- Server-side IP geolocation (we'll leave `ip_country` nullable; can fill from an edge function later).
- Email/SMS waitlist notifications — we only store `waitlist_requested=true`.
- Backfill of historical attempts.

## Files

**New**
- `supabase/migrations/<ts>_stockout_attempts.sql`
- `src/lib/stockoutService.ts` (RPC wrappers + dedup helpers)
- `src/components/landing/StockoutMessageView.tsx`
- `src/pages/admin/AdminStockoutDemand.tsx`
- `src/components/admin/StockoutAlertCard.tsx` (used on AdminDashboard)

**Edited**
- `src/components/landing/CODFormModal.tsx` — branch on stock check before `createOrder`.
- `src/lib/metaPixel.ts` — add `trackStockoutAttempt`.
- `src/App.tsx` — route.
- `src/pages/admin/AdminLayout.tsx` — sidebar entry.
- `src/pages/admin/AdminDashboard.tsx` — alert card.
- `src/pages/admin/AdminProducts.tsx` (or product detail) — small signal block.

After approval I'll start with the migration, then wire the landing flow, then the admin UI.
