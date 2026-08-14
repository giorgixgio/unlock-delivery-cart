# Fix bundle grid jumping and missing same-category suggestions

## What's wrong now

Every time an item is selected, the whole grid is rebuilt: recommended items are prepended to the top of the list, so all cards shift positions under the user's finger. That causes the "jumps up or down" feeling. And because those same-category picks are inserted at the very top of the page — far above where the user is scrolled — they are never actually seen.

## What it should do

1. **The base order never moves.** Compute the catalog order once per session (impulse hooks first, then evenly mixed categories). Selecting, deselecting, or filtering never reshuffles it.
2. **Same-category suggestions appear right where the user is looking.** When an item is tapped, insert up to 4 unselected products from that item's category directly *after* the tapped card, as an inline strip with a small Georgian label (e.g. "მსგავსი ნივთები"). Items already visible in that position stay put; only new cards are inserted below the tapped one.
3. **No scroll jump.** Cards above the tapped item keep their index, so scroll position stays anchored. Deselecting removes the strip that belongs to that item.
4. **Shallow categories** (fewer than 4 unselected items) show what exists plus impulse filler, keeping the existing divider label.
5. **Category filter view** keeps working as pure visual filtering; suggestion strips are suppressed while a specific category filter is active (the whole grid is already that category).

## Technical notes

- `src/lib/bundleGridEngine.ts`: split into `buildBaseOrder({ pool, seed, featuredId })` (memoized on catalog + seed only) and `insertCategoryStrips({ base, selectedIds, selectedCategories })` which splices suggestions in place after the matching card and returns the ids marked as "suggestion" for styling. Drop the phase-based prepending.
- `src/pages/BundleLanding.tsx`: use the two-step memo, keep `dividerAfterId` behavior for shallow categories, and keep the lazy `limit` window from resetting on selection (only reset on category-filter change) so the rendered window doesn't collapse when a strip is added.
- No changes to selection state, pricing, checkout, or any other page.
