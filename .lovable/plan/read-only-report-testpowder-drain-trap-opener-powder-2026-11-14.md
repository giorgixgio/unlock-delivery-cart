# Read-only report: testpowder (drain/trap opener powder)

No code, ad, ad set or budget changes. Only GET reads from Meta and SELECT queries on the database.

## Steps
1. **Meta discovery** (act_1368063587966686): list all ad sets, filter name containing "testpowder" (case-insensitive, copies included). Read their campaigns and ads. Fields: name, id, campaign, status/effective_status, daily_budget, optimization_goal, created_time/start_time; ads: name, id, status/effective_status, landing URL from creative (object_story_spec link / asset feed link / url_tags).
2. **Meta daily insights** (time_increment=1, from earliest ad set start to today, account timezone Tbilisi), level=adset and level=ad: spend, impressions, reach, frequency, CPM, inline link clicks, link CTR, link CPC, lead actions (pixel lead), cost per lead. Lifetime totals per ad set and ad via a separate non-incremented request (reach/frequency are not summable). If Meta demands an async report job, stop and tell you.
3. **Our orders**: orders joined to order_items on the product (matched by SKU/product id of the testpowder product), Tbilisi date, excluding test orders (`is_test_order` / test_sku flag rules). Per day: orders, confirmed (auto vs operator), cancelled, still open, sent to courier, delivered, failed. Cost per confirmed lead = Meta spend / confirmed.
   - Note: the product is in test mode, so its orders may be flagged as test; I'll report the excluded count separately so the gap is visible.
4. **Funnel**: funnel_events for product_slug სააბაზანოს-მილებისა-და-ტრაპის-გასახსნელი-ფხვნილი by Tbilisi day: landing_view, form_open, phone_entered, order_submitted (event names mapped to the actual stored names).

## Output
Raw tables in chat, no recommendations. Daily rows saved as CSV in Files (`testpowder_report_<start>_to_2026-11-14.csv`).
