import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isOwnerAlertEnabled, onwayBatchCounts } from "../_shared/telegramAlertPolicy.ts";

Deno.test("lead notifications are disabled", () => assertEquals(isOwnerAlertEnabled("order_created"), false));
Deno.test("daily operator statistics are disabled", () => assertEquals(isOwnerAlertEnabled("operator_daily_summary"), false));
Deno.test("low-stock notifications are disabled", () => assertEquals(isOwnerAlertEnabled("low_stock_run"), false));
Deno.test("billing reminders stay enabled", () => assertEquals(isOwnerAlertEnabled("billing"), true));
Deno.test("manual Onway batch notifications stay enabled", () => assertEquals(isOwnerAlertEnabled("bulk_fulfilled"), true));
Deno.test("API Onway batch notifications are enabled", () => assertEquals(isOwnerAlertEnabled("onway_api_batch"), true));
Deno.test("API batches count actual attempts, excluding duplicate locks", () => {
  assertEquals(onwayBatchCounts([{ ok: true }, { ok: false }, { ok: false, skipped: true }]),
    { attempted: 2, sent: 1, failed: 1 });
});
Deno.test("preview or all-skipped requests produce no attempted batch", () => {
  assertEquals(onwayBatchCounts([]).attempted, 0);
  assertEquals(onwayBatchCounts([{ ok: false, skipped: true }]).attempted, 0);
});