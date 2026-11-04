import { assertEquals } from "jsr:@std/assert@1";
import { closesProblemFlag, hasMovedPastPickup } from "./courierShipment.ts";

Deno.test("statuses that prove Onway has the parcel close a pickup problem", () => {
  for (const s of ["აღებული", "საწყობში", "გაგზავნილი ფილიალში", "გატანილი ჩასაბარებლად", "ჩაბარებული", "ხელმეორედ გატანა"]) {
    assertEquals(hasMovedPastPickup(s), true, s);
  }
});

Deno.test("statuses before the courier has the parcel do not close a pickup problem", () => {
  for (const s of ["ასაღები", "გაფორმებული", "დაყოვნებული", "არ ჩაბარდა", "აღების გაუქმება", ""]) {
    assertEquals(hasMovedPastPickup(s), false, s);
  }
  assertEquals(hasMovedPastPickup(null), false);
  assertEquals(hasMovedPastPickup("  აღებული  "), true, "surrounding spaces are ignored");
});

Deno.test("only pickup problems are auto-closed, never delivery problems", () => {
  assertEquals(closesProblemFlag("pickup_problem", "აღებული"), true);
  assertEquals(closesProblemFlag("delivery_failed", "ხელმეორედ გატანა"), false);
  assertEquals(closesProblemFlag("none", "აღებული"), false);
  assertEquals(closesProblemFlag(null, "აღებული"), false);
  assertEquals(closesProblemFlag("pickup_problem", "ასაღები"), false);
});
