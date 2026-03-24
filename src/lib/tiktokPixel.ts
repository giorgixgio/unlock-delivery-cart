declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>) => void;
      page: () => void;
      identify: (params: Record<string, unknown>) => void;
    };
  }
}

export function ttqTrackViewContent(product: { id: string; title: string; price: number }) {
  window.ttq?.track('ViewContent', {
    content_id: product.id,
    content_name: product.title,
    value: product.price,
    currency: 'GEL',
    content_type: 'product',
  });
}

export function ttqTrackAddToCart(product: { id: string; title: string; price: number }) {
  window.ttq?.track('AddToCart', {
    content_id: product.id,
    content_name: product.title,
    value: product.price,
    currency: 'GEL',
    content_type: 'product',
  });
}

export function ttqTrackInitiateCheckout(value: number, itemCount: number) {
  window.ttq?.track('InitiateCheckout', {
    value,
    currency: 'GEL',
    quantity: itemCount,
  });
}

export function ttqTrackPurchase(value: number, orderId?: string) {
  window.ttq?.track('CompletePayment', {
    value,
    currency: 'GEL',
    ...(orderId && { order_id: orderId }),
    content_type: 'product',
  });
}
