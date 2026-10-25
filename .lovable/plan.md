# Mini camera landing and real reviews

## Bump audit result

The catalog camera SKU is `002` (not `G888-T4656-002`), price **29₾**. The current bump passes `fixed_price: 19` to the order writer: the extra camera is persisted with **unit_price 19₾ and line_total 19₾**. The database writer inserts those amounts unchanged; existing orders also contain 19₾ camera add-on lines. Its displayed offer already says 19₾, but the page's running subtotal mistakenly adds 15₾ after acceptance. Correct that subtotal to the same 19₾ value, including before the GPS upsell, without changing what is charged. This is the only intentional correction on the original page; its design, URL and funnel remain unchanged.

## Separate mobile landing

- Add lazy-loaded `MiniCameraLanding.tsx`, selected only by `/p/mini-camera`, resolving the existing camera product and loading its `custom-mini-camera` configuration. Do not change the original product's variant to custom: its Georgian URL stays GenericLanding.
- Use a max-width-lg white/light premium layout, bold Georgian headings, near-black text, success-green purchase buttons, soft shadows and 16–20px individual cards. Preserve the logo and existing announcement bar.
- Build all requested sections in order: swipe gallery with thumbnails/dots and optional video; title and real rating/sold-count fallback; existing 1/2/3 quantity prices; real daily-order and stock strips; delivery chips; setup steps; six use cases; optional day/night drag comparison; size graphic; comparison table; specs; reviews; box contents; FAQ; final and sticky purchase buttons; capped real recent-city toasts.
- Reserve image dimensions, prioritize the first WebP gallery image, defer below-fold content/media, respect reduced motion and check 390px mobile plus desktop. Use existing real product photos, not generated product claims or customer photos.

## Checkout and tracking

- Reuse the existing camera checkout state/handlers rather than reimplementing order creation: phone → eligible +1 camera bump → address → SKU 0011 single upsell → completion. Keep the existing quantity eligibility and duplicate protection.
- Preserve existing phone-first Meta conversion timing and order-ID deduplication. Include `landingVariant: custom-mini-camera` throughout new-page funnel analytics; keep old-page events tagged as before.
- Preserve quantity pricing: 1 = 29₾, 2 = 46.40₾, 3 = 56.55₾, with the same existing rounding and standard delivery.

## Admin-editable content

- Store the new variant content under the existing camera product's `landing_config`, in a namespaced configuration that GenericLanding ignores.
- Extend Admin → Landing Pages with fields for gallery/video, day/night images, headings/copy, specs, box contents, FAQ answers and section switches, plus links to the old/new/preview pages.
- Seed the provided Georgian text. Leave missing video, comparison images, box contents and FAQ answers unset; hide incomplete optional sections rather than inventing answers or product specifications.

## Real reviews and review requests

- Add `product_reviews` and protected single-use review-request tokens linked to delivered orders. Treat an order as delivered when its status is delivered or its linked courier shipment has the established normalized DELIVERED state; shipped alone is insufficient. Public ordinary reads return approved reviews only; moderation and request management require authorized admins, not warehouse/scanner roles.
- Add `/r/:token` with rating, text and optional photo upload. Validate the delivered-order relationship and consume the token atomically to prevent duplicate submissions. Token-linked reviews enter moderation, and their verified badge is derived from the real delivered order, never a user-controlled flag.
- Add Admin → Reviews: filtering, approval/hiding, real external review imports with required source and optional screenshot, and delete-demo action. Facebook imports carry the Facebook label, not the verified badge.
- Seed 15 clearly marked demo reviews. A narrowly scoped read endpoint returns only safe demo review fields when requested in preview mode; normal page queries and public table policies exclude demos. Preview ratings/bars/cards include demos, without publishing them as real reviews.
- Add a delivered-camera review-request SMS action with eligible count, exact message/link preview and explicit confirmation. Use the existing smsoffice integration and BIGMART sender, server-side batching/idempotency and sms_logs. Never auto-send or send real SMS during verification.
- Real-data endpoints return aggregates or city only, never names, phone numbers, order IDs or full order rows. Cache counts, use Tbilisi day boundaries, round fallback sold units down to hundreds, hide today counts below 10 and stock at 0/null, and suppress recent-order toasts without orders in two hours.

## Technical safeguards and verification

- Apply schema changes with explicit grants and RLS in migrations. Keep review tokens private and validate all submission, upload and SMS inputs server-side.
- Test exact quantity/bump prices, original-versus-alias variant isolation, demo exclusion, verified eligibility, delivered-only single-use tokens, daily/recent count thresholds and SMS duplicate prevention.
- Browser-check original and new URLs, quantity changes, checkout transitions, review submission/moderation and mobile layout. Use isolated fixtures for checkout/review tests; do not create ordinary customer orders, change real fulfillment statuses, send SMS or change ads.
- Report the final bump price, new URL, missing media/FAQ/box fields and what was verified. Do not publish automatically.
