import { describe, expect, it } from 'vitest';
import { cameraDemoFill, nextCameraDemoStock, readCameraDemoStock } from '@/lib/cameraDemoStock';
describe('camera demo stock', () => {
 it('starts at 50 pieces', () => { expect(readCameraDemoStock(null)).toEqual({remaining:50,drops:0}); });
 it('drops by one, two, then three pieces', () => { const first=nextCameraDemoStock({remaining:50,drops:0}); const second=nextCameraDemoStock(first); const third=nextCameraDemoStock(second); expect([first.remaining,second.remaining,third.remaining]).toEqual([49,47,44]); });
 it('fills the scarcity bar further as stock drops', () => { expect(cameraDemoFill(50)).toBe(0.75); expect(cameraDemoFill(44)).toBe(0.78); });
 it('retains saved progress for repeat visits', () => { expect(readCameraDemoStock('{"remaining":44,"drops":3}')).toEqual({remaining:44,drops:3}); });
 it('never drops below eight or accepts invalid stored stock', () => { expect(nextCameraDemoStock({remaining:8,drops:2}).remaining).toBe(8); expect(readCameraDemoStock('{"remaining":-5,"drops":2}').remaining).toBe(50); });
});