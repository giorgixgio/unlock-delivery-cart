# SKU 0019 (hose nozzle) CPA report: read-only

No code changes. No changes to ads, ad sets or budgets. This report only reads Meta and our own order data.

## Steps
1. **Find the ad sets.** In act_1368063587966686, list every campaign, ad set and ad. Keep the ad sets whose name contains "0019" or "შლანგი" (copies included), plus any whose ads link to the hose nozzle's /p/ page. For each one, record: name, id, campaign, status and effective status, daily budget (campaign or ad set level), optimization goal, start time and created time. The ad set created earlier is the original and the later copy is the duplicate. The duplicate's created time sets day D.
2. **Daily rows from D−7 to today.** Pull these per ad set, one row per day: spend, impressions, reach, frequency, CPM, link clicks, link CTR, link CPC, leads (the account's lead or purchase result action), and cost per lead. Add a combined row per day across all 0019 ad sets. Each one is a normal, synchronous insights read. If Meta asks for a background report job, I'll stop and tell you instead of starting one.
3. **Comparisons (tables only).**
   - Original ad set, before D vs after D: CPM, frequency, cost per lead.
   - Original vs duplicate on the same days.
4. **Audience overlap.** Check whether the Marketing API exposes an overlap figure for two ad sets. If it doesn't, I'll say so plainly (the Audience Overlap tool is in Ads Manager only). As a side-by-side table, I'll also show both ad sets' targeting (locations, ages, interests, custom audiences, placements).
5. **Our own orders.** For each day in the same window, show SKU 0019 orders (test orders excluded) and how many were confirmed, split into auto and operator. Then show the share confirmed and cost per confirmed lead (combined Meta spend ÷ confirmed). Days use Tbilisi time, the same as the ad account's timezone. I'll check that the timezones match.

## Output
- Tables in chat, with no recommendations.
- One CSV in Files with the daily rows: per ad set, the combined total, and our order and confirmation counts.

## Technical notes
- The insights read uses level=adset, time_increment=1 and an explicit time_range. Fields: spend, impressions, reach, frequency, cpm, inline_link_clicks, inline_link_click_ctr, cost_per_inline_link_click and actions/cost_per_action_type.
- Order counts come from orders joined to order_items on the product SKU for 0019. Confirmation is read from the existing status and confirmation-source fields, and test orders are excluded by the test SKU flag.
