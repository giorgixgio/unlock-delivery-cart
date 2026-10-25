import { describe, expect, it } from 'vitest';
import { cameraDemoFill, nextCameraDemoStock, initialCameraDemoStock } from '@/lib/cameraDemoStock';
describe('camera demo stock', () => {
 it('starts at 50 pieces on every mount', () => { expect(initialCameraDemoStock()).toEqual({remaining:50,drops:0}); const changed=nextCameraDemoStock(initialCameraDemoStock()); expect(changed.remaining).toBe(49); expect(initialCameraDemoStock()).toEqual({remaining:50,drops:0}); });
 it('drops by one, two, then three pieces', () => { const first=nextCameraDemoStock({remaining:50,drops:0}); const second=nextCameraDemoStock(first); const third=nextCameraDemoStock(second); expect([first.remaining,second.remaining,third.remaining]).toEqual([49,47,44]); });
 it('fills the scarcity bar further as stock drops', () => { expect(cameraDemoFill(50)).toBe(0.75); expect(cameraDemoFill(44)).toBe(0.78); });
 it('caps the total decrease at ten pieces per page session', () => { let stock=initialCameraDemoStock(); for(let i=0;i<30;i++) stock=nextCameraDemoStock(stock); expect(stock.remaining).toBe(40); expect(nextCameraDemoStock({remaining:41,drops:2}).remaining).toBe(40); });
});