
# Meta Pixel Integration

Pixel ID: **728181040891330**

## What will be added

### 1. Base Pixel Code (index.html)
Add the standard Meta Pixel snippet to the `<head>` of `index.html`. This automatically fires a **PageView** event on every page load.

### 2. Pixel Helper Module (src/lib/metaPixel.ts)
A small utility file that provides typed helper functions for firing Meta Pixel events from React code:
- **trackAddToCart(product)** -- fires `AddToCart` with product name, ID, price, and currency (GEL)
- **trackPurchase(value, orderId)** -- fires `Purchase` with total value and order ID
- **trackViewContent(product)** -- fires `ViewContent` when a product sheet is opened

### 3. Wire up events in existing components
- **CartContext.tsx** -- call `trackAddToCart` inside the `addItem` function
- **OrderSuccess.tsx** -- call `trackPurchase` on mount (fires once per order)
- **ProductSheet.tsx** -- call `trackViewContent` when the sheet opens

## Technical details

**index.html** -- Insert the standard `fbq('init', '728181040891330')` + `fbq('track', 'PageView')` snippet and the noscript fallback image in `<head>`.

**src/lib/metaPixel.ts** -- New file:
```typescript
export function trackAddToCart(product: { id: string; title: string; price: number }) {
  window.fbq?.('track', 'AddToCart', {
    content_ids: [product.id],
    content_name: product.title,
    value: product.price,
    currency: 'GEL',
  });
}

export function trackPurchase(value: number, orderId?: string) {
  window.fbq?.('track', 'Purchase', {
    value,
    currency: 'GEL',
    ...(orderId && { order_id: orderId }),
  });
}

export function trackViewContent(product: { id: string; title: string; price: number }) {
  window.fbq?.('track', 'ViewContent', {
    content_ids: [product.id],
    content_name: product.title,
    value: product.price,
    currency: 'GEL',
  });
}
```

**CartContext.tsx** -- Import and call `trackAddToCart(product)` inside `addItem`.

**OrderSuccess.tsx** -- Import and call `trackPurchase` in a `useEffect` on mount, using the order total from location state.

**ProductSheet.tsx** -- Import and call `trackViewContent` when the sheet opens.

No new dependencies needed. The pixel loads from Meta's CDN via the script tag.
