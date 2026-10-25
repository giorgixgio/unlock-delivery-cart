import {describe,it,expect} from 'vitest';
import {reviewVisible,reviewVerified,showTodayCount,showStockCount,normalizeReviewPhone,REVIEW_BATCH_LIMIT} from '../../supabase/functions/camera-reviews/rules';
describe('camera review and proof rules',()=>{
 it('excludes demo rows on ordinary visits',()=>{expect(reviewVisible('demo','demo',false)).toBe(false);expect(reviewVisible('demo','demo',true)).toBe(true);expect(reviewVisible('pending','order_link',true)).toBe(false);});
 it('never verifies Facebook imports even when delivered',()=>{expect(reviewVerified('facebook_comment',true)).toBe(false);expect(reviewVerified('order_link',false)).toBe(false);expect(reviewVerified('order_link',true)).toBe(true);});
 it('hides daily proof below ten',()=>{expect(showTodayCount(9)).toBe(false);expect(showTodayCount(10)).toBe(true);});
 it('hides zero or unknown stock',()=>{expect(showStockCount(0)).toBe(false);expect(showStockCount(null)).toBe(false);expect(showStockCount(30)).toBe(true);});
 it('limits manually confirmed SMS batches and validates phones',()=>{expect(REVIEW_BATCH_LIMIT).toBe(50);expect(normalizeReviewPhone('+995 599 123 456')).toBe('995599123456');expect(normalizeReviewPhone('123')).toBe(null);});
});