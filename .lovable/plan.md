

# Fix Export Quantities + Add Sticker Generator + Packing List

## 1. Fix Quantity Bug in Courier Export

**Problem**: Column G currently outputs per-item quantities joined by commas (e.g., "1,1,1" for 3 separate line items). The courier system expects the **total item count** for the entire order.

**Fix**: In `supabase/functions/export-courier/index.ts`, change the quantity calculation from joining individual quantities to summing them:
```
// Before: items.map(i => String(i.quantity)).join(",")  --> "1,1,1"
// After:  items.reduce((sum, i) => sum + i.quantity, 0) --> "3"
```

---

## 2. Sticker Generator (4x3 Thermal Printer)

After the courier CSV import (MassFulfillModal), add a "Print Stickers" button on the "done" step that generates a printable HTML page optimized for 4x3 thermal stickers.

Each sticker contains:
- Sequence number + date + page count (top line)
- Sender: BIGMART
- Recipient: full name, address, city, phone
- QR code encoding: tracking number, SKU, order number, address, recipient name, sender BIGMART, quantity 1
- Tracking number (text)
- Quantity: 1 (fixed, since items are consolidated per sticker)
- SKU number (large, bold, bottom)

**Implementation**:
- New component `src/components/admin/StickerPrintView.tsx`
- Uses a lightweight QR code library (qrcode-generator via CDN or inline) to render QR codes
- Opens a new browser window with `window.open()` containing print-optimized CSS (`@media print` with 4x3 inch page size)
- Each sticker is one page break
- For orders with multiple SKUs, generate one sticker per SKU line item
- Integrate into `MassFulfillModal.tsx` "done" step

---

## 3. Packing List by Batches

After courier import, add a "Packing List" button that generates a warehouse-friendly batched packing list.

**Logic**:
- Take all successfully fulfilled orders from the import
- Group them into batches of ~15 orders
- Sort orders within each batch by SKU to minimize warehouse trips (SKU = carton position)
- Display per batch: SKU (carton position) -> list of order numbers that need that SKU + quantity

**UI**: New component `src/components/admin/PackingListView.tsx`
- Opens in a printable window
- Each batch is a section with a header ("Batch 1 of 7 -- 15 orders")
- Within each batch, SKUs are listed in numerical order (ascending = warehouse walk order)
- Each SKU row shows: SKU number (bold), and which orders need it with quantities
- Example format:
  ```
  SKU 118 (Carton 118)
    -> #100134 x2, #100138 x1
  
  SKU 321 (Carton 321)  
    -> #100134 x1, #100135 x4, #100140 x1
  ```

**Integration**: Both buttons added to the MassFulfillModal "done" step, alongside the existing "Download Report" button.

---

## Technical Details

### Files to modify:
1. **`supabase/functions/export-courier/index.ts`** -- fix quantity sum
2. **`src/components/admin/MassFulfillModal.tsx`** -- add Sticker + Packing List buttons on "done" step, pass fulfilled order data
3. **`src/components/admin/StickerPrintView.tsx`** (new) -- sticker rendering + print
4. **`src/components/admin/PackingListView.tsx`** (new) -- batch packing list rendering + print

### QR Code approach:
Use a small inline QR code generator (no external dependency needed -- a ~2KB function) to avoid adding npm packages. The QR will encode a string like:
`TRACK:ABC123|SKU:321|ORD:100134|ADDR:თიკო, ვაკე...|NAME:ბიგმარტი|QTY:1`

### Data flow:
- MassFulfillModal already has the matched rows with `matchedOrderId` and tracking numbers
- On "done" step, fetch full order details (address, phone, items) for all successfully applied orders
- Pass that data to StickerPrintView and PackingListView

