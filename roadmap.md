# Roadmap — Courier section

# Roadmap — Store policy footer
- [ ] Audit existing policy pages and Meta disclosure guidance.
- [ ] Add public Georgian policy pages and shared storefront footer links without changing checkout/tracking.
- [ ] Verify footer navigation and list missing business details for the user.

# Roadmap — Mini camera landing and reviews
- [x] Audit persisted camera bump charge: 19 GEL; running subtotal aligned without changing charges.
- [x] Build isolated /p/mini-camera premium variant with shared existing funnel, editable content and real social proof; original URL stays GenericLanding.
- [x] Add secure review tokens, private photo submission, moderation, manual imports and 15 preview-only demo fixtures. Delivered test review submitted once, approved/read publicly with verified badge, hidden, then fixture removed.
- [x] Add manually confirmed batched review-request SMS for delivered camera orders. Authorized count/message preview verified; no messages sent.
- [x] Verify 390px/desktop camera layout, original URL, exact quantity prices, public/demo privacy and both bump transitions through address/GPS/completion with intercepted writes. Twelve unit tests pass.
- [ ] Populate optional video/day-night images, FAQ answers and box contents — requires user-supplied content; sections remain hidden until filled.

# Roadmap — October 20 shelf stock
- [x] Reset nine products from reported physical shelf counts with audit records, preserving the mini drill's one reserved piece; all nine catalog and override availability flags verified true through public shop reads.
- [x] Replace their ad caps with the previous +20% cancellation buffer and restart selected ad sets immediately; all nine verified ACTIVE with unchanged budgets, fresh counting, enabled order-item trigger and successful live cap-check response.
- [x] Calculate remaining-stock selling value using reported quantities and current catalog prices, excluding delivery.

# Courier tasks

- [x] Approved retiring AI model migration: replaced deprecated models in nine functions only, preserved request behavior, validated nine direct gateway sample responses and exact Georgian address prompt, deployed functions without publishing; no real order or inventory mutations used for verification.

- [x] SKU 0017: add ring-shaped shower-head gift 17GIFT, limited-time gift card and CTA; browser verified uploaded photo and 0 GEL checkout gift with unchanged 5 GEL delivery, no real order submitted.

- [x] Wholesale CRM: select an existing catalog product for a reorder without overwriting its listing
- [x] Both warehouses' shipping marks and copied supplier text use `G888-T4656-####` product identifiers, including existing legacy rows
- [x] Warehouse B copied supplier message contains bilingual warehouse address, contacts, carton mark, and packing instructions; Warehouse A copy remains unchanged

- [x] Migration: shipment columns, batch coverage+conflicts, courier_status_map, courier_alert_settings, RLS+grants
- [x] Retro-remap existing 3,846 shipments into derived_state
- [x] Fix stuck Aug 7 batch (now completed, 2,705 history rows counted)
- [x] import-courier: chunked, crash-safe finalize, status-map states, return linking, order sync
- [x] Import UI: preview counts, conflicts, coverage ranges, "only from date", progress
- [x] Statistics page (delivery rate, resolved share, auto vs operator, product, city, value band, item count, weekly)
- [x] Physical recovery metric (collected / on the way / not registered), overall + per product
- [x] Alerts page + thresholds + nav badge
- [x] Restock view
- [x] Statuses config page + nav group + routes
- [x] Unit tests for return detection, comment parsing, recovery rules
- [ ] End-to-end double-upload test — needs a real courier file uploaded through the admin (no admin session available to the agent)
- [x] Shared per-SKU recovery module (src/lib/courierRecovery.ts) used by Restock + admin Products
- [x] Products page: received back / on the way / in progress columns, sorting, totals, tooltips
- [x] Repair legacy courier-to-order links by normalized order number + customer phone; verify Products totals
- [x] Products recovery summary equals the exact return columns on the currently visible product page

# Roadmap — Operator Stats rebuild

- [x] Add unified operator call-outcome event tracking across quick review, order detail, and bulk actions
- [x] Backfill historical call-outcome events idempotently
- [x] Build paginated Tbilisi-time stats data layer and pure calculation engine with tests
- [x] Rebuild Operator Stats into Overview, Operators, Capacity planner, and Day performance tabs
- [x] Verify Dashboard-aligned day performance, store/operator filters, and mobile layout (typecheck/tests passed; authenticated preview unavailable)

# Roadmap — 0016 wrench current offer
- [x] Set catalog price to 19 GEL, restore default 5 GEL shipping, and replace free-delivery badges with stock-limited urgency copy; verified landing and checkout delivery in the browser (no order submitted).

# Roadmap — 0016 wrench previous free-shipping offer (superseded)
- [x] Free shipping (0₾) for orders where SKU G888-T4656-0016 is the main product (own landing page); upsell add-ons keep other product's shipping
- [x] Georgian free-delivery badge + live countdown to midnight Tbilisi next to price on 0016 page (emerald pill, tabular digits, reduced-motion safe)
- [x] Checkout/order summary: struck-through delivery price → "უფასო" in green for 0016
- [x] Verify at ~390px mobile: badge, timer, 0₾ total on 0016; 001 solar still shows normal fee
