import {describe,it,expect} from 'vitest';
import {woodDiscTiers,woodDiscBump,resolveWoodDiscConfig,woodDiscVisibleReviews,woodDiscTodayVisible,woodDiscStockVisible,woodDiscMedia,discountPct,WOOD_DISC_DEFAULTS} from '@/lib/woodDiscConfig';
import {getDiscountedTotal,getQtyDiscountPct} from '@/lib/landingDiscounts';
import {bumpLineTotal} from '@/lib/bumpPricing';
import {drFor,drVariantForPath,WOOD_DISC_PRODUCT_ID} from '@/lib/drLandings';
import {isTestSku} from '@/lib/testProducts';
describe('real wood-disc landing',()=>{
 it('SKU G888-T4656-0012_4 is real, never test',()=>expect(isTestSku('G888-T4656-0012_4')).toBe(false));
 it('custom-wood-disc only matches its own slug/product',()=>{expect(drFor('wood-disc',WOOD_DISC_PRODUCT_ID)?.variant).toBe('custom-wood-disc');expect(drFor('wood-disc','other')).toBeUndefined();expect(drVariantForPath('/p/wood-disc')).toBe('custom-wood-disc');});
 for(const [qty,total] of [[1,24],[2,38.4],[3,46.8]])it(`${qty} discs match shared tier and modal subtotal ${total}`,()=>{const t=woodDiscTiers(24,34,'G888-T4656-0012_4').find(t=>t.qty===qty);expect(t?.total).toBe(total);expect(t?.total).toBe(getDiscountedTotal(24,qty,'G888-T4656-0012_4'));expect(Number((24*qty*(1-getQtyDiscountPct(qty)/100)).toFixed(2))).toBe(total);});
 it('+1 fixed-price bump is 16 GEL with 40 GEL saved subtotal',()=>{const b=woodDiscBump(resolveWoodDiscConfig());expect(b.fixed_price).toBe(16);expect(b.bump_qty).toBe(1);expect(24+bumpLineTotal(24,b)).toBe(40);});
 it('admin bump override updates persisted line',()=>expect(bumpLineTotal(24,woodDiscBump(resolveWoodDiscConfig({bump_price:18})))).toBe(18));
 it('computes all savings from data; no discount means no savings',()=>{expect(discountPct(24,34)).toBe(29);expect(woodDiscTiers(24,34)[0].saveCompare).toBe(10);expect(woodDiscTiers(24,null)[0].saveSingle).toBe(0);expect(woodDiscTiers(24,null)[0].saveCompare).toBe(0);expect(woodDiscTiers(30,40)[0].total).toBe(30);});
 it('public approved real only; labelled demos preview only',()=>{const rows=[{source:'order_link',status:'approved'},{source:'demo',status:'demo'},{source:'demo',status:'approved'},{source:'order_link',status:'pending'}];expect(woodDiscVisibleReviews(rows,false)).toEqual([rows[0]]);expect(woodDiscVisibleReviews(rows,true)).toEqual([rows[0],rows[1]]);});
 it('today proof requires at least ten orders',()=>{expect(woodDiscTodayVisible(9)).toBe(false);expect(woodDiscTodayVisible(10)).toBe(true);});
 it('real stock only shown when positive',()=>{expect(woodDiscStockVisible(0)).toBe(false);expect(woodDiscStockVisible(undefined)).toBe(false);expect(woodDiscStockVisible(1)).toBe(true);});
 it('four empty media slots until owner uploads',()=>{expect(WOOD_DISC_DEFAULTS.demo_slots).toHaveLength(4);expect(woodDiscMedia(resolveWoodDiscConfig())).toHaveLength(0);});
});
