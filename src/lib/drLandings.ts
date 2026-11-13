import { CAMERA_HANDLE, CAMERA_VARIANT } from '@/lib/miniCameraConfig';

/**
 * Direct-response landing registry (the SKU 002 camera layout family).
 * The camera entry holds exactly today's values; new products add an entry instead of a new page.
 */
export interface DrLanding {
  key: 'camera' | 'satori';
  slug: string;
  /** Dedicated pages resolve by product id; the camera keeps resolving by its handle + SKU. */
  productId?: string;
  handle?: string;
  sku?: string;
  variant: string;
  configKey: 'mini_camera' | 'satori_knife';
  urgencyKey: string;
  toastKey: string;
  reviewName: string;
  theme: 'camera' | 'satori';
  adminLabel: string;
  storagePrefix: string;
  fallbackSku: string;
}

export const SATORI_PRODUCT_ID = 'manual-1794600000000-satori';
export const SATORI_SLUG = 'satori-knife';
export const SATORI_VARIANT = 'custom-satori-knife';

export const DR_LANDINGS: DrLanding[] = [
  { key: 'camera', slug: 'mini-camera', handle: CAMERA_HANDLE, sku: '002', variant: CAMERA_VARIANT, configKey: 'mini_camera', urgencyKey: 'sku_002_urgency_end', toastKey: 'camera-toast-count', reviewName: 'მინი კამერა', theme: 'camera', adminLabel: 'Mini camera', storagePrefix: 'landing/mini-camera', fallbackSku: '002' },
  { key: 'satori', slug: SATORI_SLUG, productId: SATORI_PRODUCT_ID, variant: SATORI_VARIANT, configKey: 'satori_knife', urgencyKey: 'sku_satori_urgency_end', toastKey: 'satori-toast-count', reviewName: 'SATORI დანა', theme: 'satori', adminLabel: 'SATORI knife', storagePrefix: 'landing/satori-knife', fallbackSku: 'testdana' },
];
export const drBySlug = (slug?: string) => DR_LANDINGS.find(d => d.slug === slug);
export const drByVariant = (v?: string | null) => DR_LANDINGS.find(d => d.variant === v);
export const drByProductId = (id?: string | null) => DR_LANDINGS.find(d => !!d.productId && d.productId === id);
/** Product-id entries (not the camera) opened on their own slug for their own product. */
export const drFor = (slug?: string, productId?: string) => { const e = drBySlug(slug); return e?.productId && e.productId === productId ? e : undefined; };
/** Variant to tag analytics with for a pathname — camera keeps its existing `/p/mini-camera` rule. */
export const drVariantForPath = (pathname: string) => { const m = /^\/p\/([^/?#]+)\/?$/.exec(pathname); return m ? drBySlug(decodeURIComponent(m[1]))?.variant : undefined; };
