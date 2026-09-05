# Global admin store filter

## Goal
Add one admin-only store selection shared across the admin session: **All Stores**, **TrendMart (Warehouse B)**, or **BigMart (Warehouse A)**. Keep storefront behavior, admin authentication, and the wholesale CRM's own warehouse controls unchanged.

## Implementation

### 1. Save each staff member's default store
- Add a minimal `admin_preferences` table keyed by the signed-in authentication user ID, with nullable `default_store` limited to `A`, `B`, or `ALL` and an `updated_at` timestamp.
- Do not link it to `admin_users.id`: that table is an email-based staff registry and its UUID is not the authentication user ID. The preference row will be securely owned by `auth.uid()` through row-level policies.
- Grant authenticated users only the access needed to read and upsert their own preference; retain service access.

### 2. Admin-only shared context and controls
- Add an admin-scoped `StoreProvider` mounted inside the existing authenticated admin guard.
- On each new authenticated admin session, load the saved default. Keep later toggle changes session-only.
- Add one reusable segmented `ToggleStore` control and place it in the sidebar/mobile menu plus the top of Dashboard, Orders, and Products.
- Add a full-screen first-login picker with branded TrendMart and BigMart choices, a smaller All Stores choice, and a close button. Choosing saves the default; closing does not, and the picker will not reopen until the next login/session start.
- Add a small default-store selector in Admin Settings so users can explicitly change the saved default later.

### 3. Consistent data filtering
- Add an admin-safe read model that maps each order to Warehouse A or B from its order items and the existing `products.warehouse` field; unmatched/legacy products fall back to Warehouse B, matching the existing catalog default.
- Apply the shared store selection to Dashboard totals/counts, Orders lists/tab counts, Products, Operator Stats, Stockout Demand, Bin Locations, SKU Health, and other existing admin lists whose rows can be tied directly to an order or product.
- Clear page selections and refresh dependent data when the active store changes so bulk actions never retain hidden rows.
- Leave order detail screens and already-scoped packing/courier batch detail screens unchanged: navigation into a specific record should remain stable, while their parent lists are filtered.
- Leave both wholesale pages' existing local Warehouse A/B/All controls unchanged and independent to avoid altering their current workflows.

## Technical notes
- Store type: `'A' | 'B' | 'ALL'`.
- Product filtering uses the existing `products.warehouse` value with null treated as `B`.
- Order filtering uses the new read-only mapping rather than adding or mutating an `orders.warehouse` column, so checkout/storefront writes remain untouched.
- Existing admin authorization functions and login flow are not modified.

## Validation
- Verify first-login choose, dismiss, reload, sign-out/sign-in, and Settings default-change behavior.
- Verify switching store in one control updates all admin placements immediately.
- Verify Dashboard, Orders, Products, and each applicable list show only matching data for A/B and complete data for All.
- Verify the wholesale CRM still uses its current warehouse query toggle and public storefront domain filtering is unchanged.
