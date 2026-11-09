# Pull "test1" / "test4" ad set data (read-only, no code changes)

## What I'll do
Reports only. I won't change any code or settings, and I won't make any Meta changes.

1. **Find the ad sets** in ad account act_1368063587966686. These are all ad sets whose names contain "test1" or "test4" in any capitalization, copies included, plus their campaigns.
2. **Ad set details:** name and id, campaign name and id, status and effective status, daily budget, optimization goal, promoted event and start time.
3. **Ad details:** each ad's name and id, status, and the landing URL from its creative. The product comes from the /p/ slug in that URL.
4. **Meta numbers**, for each ad set and each ad, both lifetime and per day:
   - Spend, impressions, reach, frequency, CPM
   - Link clicks, CTR (link), CPC (link)
   - Landing page views, leads, purchases, and every other action type with its count
   - Cost per result, based on each ad set's optimization goal
5. **Our own data for the same date range** (earliest start date through today):
   - funnel_events counts for landing_view, form_open, phone_entered and order_submitted, grouped by product_slug
   - Orders whose utm_campaign matches those campaign IDs, also grouped by product_slug
6. **Output:** raw tables with no recommendations. The tables are: ad sets (lifetime), ads (lifetime), daily rows, ad→URL list, funnel counts, and order counts. I'll also save the daily rows as a CSV in Files.

## Notes
- Meta leaves zero-count actions out of its reports, so a missing action shows as 0, marked "not recorded".
- If funnel_events doesn't record utm_campaign, I'll group funnel counts by product_slug and date only, and say so.
- Very large daily reports may need a Meta background report job. That needs your approval.
