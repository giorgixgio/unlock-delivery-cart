# SKU 002 landing-page conversion flow

## What will change

- Place the supplied promotional image on SKU `002`’s product page immediately before the trust badges. It will not appear on other products.
- Preserve SKU `002`’s custom product description as authored, including its own paragraphs and emoji markers, instead of converting every sentence into a new `✅` bullet. Add a reusable custom-description mode so future product-specific pages can opt into the same treatment.
- Restrict SKU `002`’s post-phone cross-sell to SKU `0011` only.
- Insert a SKU `002`-only quantity offer immediately after phone submission:
  - Headline: `დაამატე და დაზოგე`
  - Offer: add one more SKU `002` item for `15₾`
  - Accepting adds the extra camera as a real order line and updates the order total.
  - Declining leaves the original order unchanged.
- Continue from that quantity offer into the SKU `0011` upsell, then into the existing address and completion flow.

## Technical details

- Store the uploaded image through the project asset system and reference it from a per-SKU landing-media configuration.
- Reuse the existing secure order-item update path for the quantity addition rather than changing checkout creation.
- Keep all SKU-specific behavior behind exact SKU checks, preserving every other product’s current funnel.
- Verify the target landing page, both accept/decline transitions, description rendering, and the SKU `0011`-only upsell.
