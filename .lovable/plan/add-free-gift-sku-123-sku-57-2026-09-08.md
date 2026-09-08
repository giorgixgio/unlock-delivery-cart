# Add free gift: SKU 123 → SKU 57

## What
Add a new entry to `src/lib/freeGiftOffers.ts` so that every order of SKU 123
(სავარცხნი ხელთათმანი) automatically includes SKU 57 (სათამაშო სასროლი ბურთი)
as a pre-selected free gift, exactly like the existing 316→147, 450→242, and
411→294 offers.

## Change (single file)
Add to `FREE_GIFT_OFFERS`:

```ts
"123": {
  giftSku: "57",
  valueGel: 9,
  label: "საჩუქარი",
  headline: "საჩუქარი ყველა შეკვეთაზე",
  bullets: [
    "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
    "უკვე დამატებულია შენს შეკვეთაში",
  ],
},
```

This automatically:
- Shows the gift card on SKU 123's landing page
- Adds SKU 57 as a real 0₾ line item at checkout
- Keeps the order in the Singles courier lane (one bin trip) while printing both SKUs on the label, via the existing `FREE_GIFT_PAIRS` / `isGiftPairSkuSet` logic

No other files change. No migration, no new routes.
