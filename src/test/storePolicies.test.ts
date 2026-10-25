import {describe,it,expect} from 'vitest';
import {TRENDMART_RETURNS,TRENDMART_SELLER} from '@/lib/storePolicies';
describe('TrendMart policy business rules',()=>{
 it('uses the supplied registered seller',()=>{expect(TRENDMART_SELLER).toEqual({name:'შპს ტრენდ პოინტ 1',id:'405891726',address:'კახეთის გზატკეცილი 4',email:'info@trendmart.ge'});});
 it('provides 14-day free damaged-on-arrival returns',()=>{expect(TRENDMART_RETURNS.damagedOnArrivalDays).toBe(14);expect(TRENDMART_RETURNS.damagedOnArrivalReturnFee).toBe(0);});
 it('refunds by bank transfer',()=>{expect(TRENDMART_RETURNS.refundMethod).toBe('bank_transfer');});
 it('requests the order number and original checkout phone',()=>{expect(TRENDMART_RETURNS.requestFields).toEqual(['orderNumber','checkoutPhone']);});
});