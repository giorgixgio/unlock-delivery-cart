# Roadmap — Courier section

# Roadmap — Billing reminder payment correction
- [x] Reject implausible post-payment balance rebounds and rearm on substantial payments; five tests pass, deployed, restored the observed $185.17 post-payment baseline, and live dry-run blocked the stale $352.94 response without sending an SMS.

# Roadmap — Store policy footer
- [x] Compact the footer with subtle two-column links; verified all six policy back arrows return to the camera page with ad-link parameters intact, no overflow or browser errors.
- [x] Audit existing policy pages and Meta disclosure guidance: no public policy pages/footer exist; Meta requires accurate privacy disclosures and lawful, nonmisleading offers, not a guaranteed anti-ban footer checklist.
- [x] Add six public Georgian policy pages and shared TrendMart-only footer with supplied seller identity and email, 14-day free damaged-on-arrival returns and bank refunds; preserve statutory withdrawal rights rather than forbid all other refunds.
- [x] Verify all six links at 390px without overflow or browser errors; BigMart excluded, checkout/tracking unchanged, 12 targeted tests passed.
- [ ] Complete legal/privacy review — user must supply a customer-support phone and confirm non-damaged return logistics/costs; no tracking-consent controls were added or verified by this footer-only task.

# Roadmap — Mini camera landing and reviews
- [x] Add presentation-only partner stock at 50, scroll drops of 1/2/3 down to 40 and animated scarcity fill; no visible demo label or saved progress, resets on refresh, real inventory unchanged.
- [x] Match the original camera URL to the complete preview content for partner review, including existing demo reviews, count and AI summary; preserve the URL, real usage overlay and checkout.
- [x] Audit persisted camera bump charge: 19 GEL; running subtotal aligned without changing charges.
- [x] Build isolated /p/mini-camera premium variant with shared existing funnel, editable content and real social proof; original URL stays GenericLanding.
- [x] Add secure review tokens, private photo submission, moderation, manual imports and 15 preview-only demo fixtures. Delivered test review submitted once, approved/read publicly with verified badge, hidden, then fixture removed.
- [x] Add manually confirmed batched review-request SMS for delivered camera orders. Authorized count/message preview verified; no messages sent.
- [x] Remove the GPS tracker (0011) post-phone upsell from the SKU 002 camera funnel; the camera presentation now ends at the address step with no upsell sheet, verified at 390px on the ad URL with stubbed writes; other products keep their upsells. Fifteen unit tests pass.
- [x] Verify 390px/desktop camera layout, original URL, exact quantity prices, public/demo privacy and both bump transitions through address/completion with intercepted writes.

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

# Roadmap — Call sync (phone ↔ PC)
- [x] active_calls table with per-operator RLS + Realtime publication
- [x] Call button in orders list and quick-review modal; write starts before tel: navigation, never blocks dialing
- [x] PC panel (order details + notes) on phone-initiated calls; full-screen one-tap dial overlay on PC-initiated calls
- [x] +995 tel: normalization, 30s freshness window, same-device suppression, header "Call sync: connected" indicator
- [ ] Authenticated end-to-end realtime test — minting a session for info@bigmart.ge needs user approval; verify on two real devices instead

# Roadmap — Telegram owner alerts
- [x] Keep new-lead notifications only; creation trigger requires pending_details, no alert on subsequent completion updates.
- [x] Send daily operator summary at 19:00 Asia/Tbilisi with canonical calls, first/last recorded activity, handled orders and outcomes; six tests pass, real historical totals verified and live preview returned 200.
- [x] Notify owner once on courier bulk import applying-to-completed/partial transition, including authenticated actor/file/result counts; real 74-order historical batch preview returned 200 without changing orders.
- [ ] Observe automatic bulk alert on Eto's next real upload — awaits her next courier file; no real fulfillment performed for testing.
- [x] Telegram connector linked; bot @Deliveryquestbot, owner chat 6441625882 confirmed with a test message
- [x] New-order alert trigger + `telegram-alerts` edge function (items, total, COD note)
- [x] Low-stock digest every 15 min at ≤50 pieces, 24h re-reminder, gift SKUs excluded — live run delivered 40-product alert
- [x] Billing reminders now also send to Telegram as SMS backup; milestone advances when either channel delivers
- [ ] New-order alert seen from a real customer order (code path tested only via the low-stock route)
