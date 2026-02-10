

## 🛒 Georgian COD Ecommerce — "Delivery Unlock Quest"

A custom ecommerce storefront designed for older, low-digital-literacy users in Georgian regions. The entire experience revolves around a gamified "unlock delivery" mechanic — users fill a progress bar to 40 GEL before they can place a COD order.

---

### 🎨 Visual Identity
- **Temu-inspired palette**: Vibrant orange-red primary, bright accent badges, white/light gray backgrounds, bold black text
- **All text in Georgian (ქართული)**
- Extra-large typography, high-contrast buttons, rounded soft-shadow cards
- Subtle micro-animations (150–250ms) on interactions — no complex motion
- Custom outlined icon set (Lucide icons), no emoji

---

### 📄 Pages

**1. Homepage (მთავარი)**
- Top: Horizontal scrollable category filter chips (6–10 categories)
- Below: Full product grid — all SKUs visible, no detail pages needed
- Each **ProductCard** shows: large image, large price in GEL, short Georgian title, oversized +/– buttons with quantity display
- Floating "+1" animation on add
- **BoosterRow** appears when cart < 40 GEL — a highlighted row of cheap items with "სწრაფად დაამატე" (Quick Add) one-tap buttons; auto-hides at 40+

**2. Cart Page (კალათა)**
- Delivery progress bar at top (same unlock mechanic)
- Large, clear item list with +/– controls and remove button
- Simple order form: სახელი (Name), ტელეფონი (Phone), რეგიონი/ქალაქი (Region/City), მისამართი (Address)
- Visual COD explanation block: "თანხას გადაიხდით კურიერთან. ბარათი არ გჭირდებათ." (You pay the courier. No card needed.)
- "შეკვეთა — გადახდა მიტანისას" (Order — Pay on Delivery) button, disabled below 40 GEL

**3. Order Success Page (შეკვეთა წარმატებულია)**
- Celebratory confirmation with checkmark animation
- Order summary and estimated delivery info
- "მთავარ გვერდზე დაბრუნება" (Back to Home) button

---

### 🧩 Key Components

**StickyCartHUD (Global Bottom Bar)**
- Always visible, sticks to bottom on all pages
- Row of small selected-item thumbnails (inventory slot style)
- Large cart total in GEL
- Animated **DeliveryProgressBar** (0 → 40 GEL)
- Dynamic text: "გჭირდება კიდევ X ₾" (below 40) → "მიტანა განბლოკილია! ✓" (at 40+)
- Lock icon → checkmark animation at unlock threshold
- Subtle glow effect when delivery unlocks
- CTA button disabled/enabled based on threshold

**DeliveryProgressBar**
- Smooth animated fill bar with GEL markers
- Color transition: gray/red → green at 40 GEL
- Lock/unlock icon state

**ProductCard**
- Large image, price, title, oversized +/– buttons
- Add-to-cart floating animation

**BoosterRow**
- Conditional row of low-price items for quick top-up
- One-tap add, disappears when threshold met

---

### ⚙️ Technical Approach

- **Shopify integration** for product catalog (fetching products) and order creation (COD orders via API)
- Cart state managed entirely in Lovable (React context/state)
- 40 GEL threshold stored as a configurable constant
- Form validation with Zod for the checkout form
- Mobile-first responsive design

---

### 🔧 Implementation Order
1. Design system setup (Temu colors, Georgian fonts, large typography tokens)
2. Cart context & delivery threshold logic
3. ProductCard + product grid with category filters
4. StickyCartHUD with DeliveryProgressBar
5. BoosterRow component
6. Cart page with order form
7. Order success page
8. Connect Shopify for product data & order submission

