declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

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
