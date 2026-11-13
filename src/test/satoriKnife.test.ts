import { describe, it, expect } from 'vitest';
import { bumpLineTotal } from '@/lib/bumpPricing';
import { DR_LANDINGS, drFor, drVariantForPath, SATORI_PRODUCT_ID } from '@/lib/drLandings';
import { resolveSatoriConfig, satoriBump, satoriImages, satoriVisibleFaq, discountPct } from '@/lib/satoriKnifeConfig';
import { isTestSku } from '@/lib/testProducts';
import { getDiscountedTotal } from '@/lib/landingDiscounts';

describe('SATORI knife landing', () => {
  it('+1 knife bump costs 19₾ and the shown subtotal equals the persisted line', () => {
    const b = satoriBump(resolveSatoriConfig());
    expect(b.fixed_price).toBe(19);
    expect(29 + bumpLineTotal(29, b)).toBe(48);
  });
  it('bump price stays admin-editable', () => {
    expect(bumpLineTotal(29, satoriBump(resolveSatoriConfig({ bump_price: 15 })))).toBe(15);
  });
  it('analytics variant is custom-satori-knife only on its own slug and product', () => {
    expect(drFor('satori-knife', SATORI_PRODUCT_ID)?.variant).toBe('custom-satori-knife');
    expect(drFor('satori-knife', 'other')).toBeUndefined();
    expect(drVariantForPath('/p/satori-knife')).toBe('custom-satori-knife');
  });
  it('camera registry entry keeps today\'s values', () => {
    const cam = DR_LANDINGS.find(d => d.key === 'camera')!;
    expect([cam.slug, cam.variant, cam.configKey, cam.urgencyKey, cam.sku]).toEqual(['mini-camera', 'custom-mini-camera', 'mini_camera', 'sku_002_urgency_end', '002']);
    expect(drFor('mini-camera', 'anything')).toBeUndefined();
  });
  it('testdana is a test SKU', () => { expect(isTestSku('testdana')).toBe(true); });
  it('hides steel and size FAQ until answered', () => {
    const q = satoriVisibleFaq(resolveSatoriConfig()).map(f => f.question);
    expect(q).not.toContain('რა ფოლადია?'); expect(q).not.toContain('რა ზომისაა?'); expect(q).toHaveLength(4);
  });
  it('no images → empty list (placeholder), never an empty URL', () => {
    expect(satoriImages(resolveSatoriConfig(), [''])).toEqual([]);
  });
  it('29₾ vs 59₾ shows −51% and tiers use the shared discounts', () => {
    expect(discountPct(29, 59)).toBe(51);
    expect(getDiscountedTotal(29, 2, 'testdana')).toBe(46.4);
  });
});
