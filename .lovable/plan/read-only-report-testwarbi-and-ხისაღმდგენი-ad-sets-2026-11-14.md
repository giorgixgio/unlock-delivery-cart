# Read-only report: testwarbi and ხისაღმდგენი ad sets

No code, ad, ad set or budget changes. Only Meta reads and database lookups.

## Steps
1. **Find the ad sets** in act_1368063587966686 whose names contain "testwarbi" or "ხისაღმდგენი" (any capitalization, which also catches "test_ხისაღმდგენი" and copies). Then read their campaigns and ads. Details: name, id, campaign, status/effective status, daily budget, optimization goal, created/start time, and the ad's landing URL. The product comes from the /p/ slug in that URL.
2. **Meta daily rows** from each ad set's start date to today (Tbilisi time), per ad set and per ad: spend, impressions, reach, frequency, CPM, link clicks, link CTR, link CPC, pixel leads, cost per lead. Lifetime totals per ad set come from a separate period-level read, because reach and frequency can't be added up day by day. If Meta requires a background report job, I stop and tell you.
3. **Our orders** per product, matched by the slug's product and its landing tag, by day: orders, test-flagged count, confirmed (auto / operator), cancelled, still open, sent to courier, delivered, failed. Cost per confirmed lead = Meta spend / confirmed. Test-flagged orders are included, and the flagged count is shown beside them.
4. **Landing steps** from funnel_events for each product's slug by day: landing_view, form_open, phone_entered, order_submitted.

## Output
Raw tables in chat, no recommendations. One CSV in Files with all daily rows: `testwarbi_khisaghmdgeni_report_<start>_to_<today>.csv`.
