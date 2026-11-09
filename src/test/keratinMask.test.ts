import { describe, it, expect } from 'vitest';
import { bumpLineTotal } from '@/lib/bumpPricing';
import { KERATIN_DEFAULTS, KERATIN_PRODUCT_ID, KERATIN_VARIANT, keratinBump, keratinVisibleSections, resolveKeratinConfig, usesKeratinPresentation } from '@/lib/keratinMaskConfig';
import { CAMERA_BUMP, CAMERA_VARIANT, usesCameraPresentation, CAMERA_HANDLE } from '@/lib/miniCameraConfig';
import { getDiscountedTotal } from '@/lib/landingDiscounts';

describe('KERAVÉ landing', () => {
  it('bump adds exactly 16₾ to both the running subtotal and the persisted line', () => {
    const bump = keratinBump(resolveKeratinConfig({}));
    const line = bumpLineTotal(24, bump); // what BumpOfferModal persists
    const subtotal = getDiscountedTotal(24, 1, 'testkrema') + bumpLineTotal(24, bump); // what the funnel shows
    expect(line).toBe(16);
    expect(bump.bump_qty).toBe(1);
    expect(subtotal).toBe(getDiscountedTotal(24, 1, 'testkrema') + 16);
  });
  it('admin-edited bump price flows through to the line', () => {
    expect(bumpLineTotal(24, keratinBump(resolveKeratinConfig({ bump_price: 14 })))).toBe(14);
    expect(bumpLineTotal(24, keratinBump(resolveKeratinConfig({ bump_price: 0 })))).toBe(16);
  });
  it('camera bump is unchanged at 19₾', () => {
    expect(bumpLineTotal(29, CAMERA_BUMP)).toBe(19);
  });
  it('is selected only by /p/keratin-mask for the product id, never the original handle or camera', () => {
    expect(usesKeratinPresentation('keratin-mask', KERATIN_PRODUCT_ID)).toBe(true);
    expect(usesKeratinPresentation('kerav-original-handle', KERATIN_PRODUCT_ID)).toBe(false);
    expect(usesKeratinPresentation('keratin-mask', 'other')).toBe(false);
    expect(usesCameraPresentation(CAMERA_HANDLE, '002')).toBe(true);
    expect(KERATIN_VARIANT).not.toBe(CAMERA_VARIANT);
  });
  it('hides optional sections that have no content', () => {
    const v = keratinVisibleSections(KERATIN_DEFAULTS, 0);
    expect(v.before_after).toBe(false);
    expect(v.box).toBe(false);
    expect(v.reviews).toBe(false);
    expect(v.faq).toBe(true);
    expect(KERATIN_DEFAULTS.faq.find(f => f.question.startsWith('რამდენად'))?.answer).toBe('');
    expect(keratinVisibleSections({ ...KERATIN_DEFAULTS, before_image: 'a' }, 0).before_after).toBe(false);
    expect(keratinVisibleSections({ ...KERATIN_DEFAULTS, before_image: 'a', after_image: 'b' }, 3).before_after).toBe(true);
  });
  it('upsell is off by default', () => {
    expect(resolveKeratinConfig({}).upsell.enabled).toBe(false);
  });
});
