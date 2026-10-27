import { describe, expect, it } from 'vitest';
import { acceptBillingBalance, isPaymentDrop } from '../../supabase/functions/meta-billing-alert/balanceGuard';

describe('billing payment balance protection', () => {
  const checked = '2026-10-27T18:55:01.970Z';
  const now = Date.parse('2026-10-27T19:00:04.133Z');
  it('rejects the observed stale $352.94 rebound after the $185.17 payment balance', () => {
    expect(acceptBillingBalance(352.94, 185.17, checked, now)).toBe(false);
  });
  it('accepts normal post-payment spending', () => {
    expect(acceptBillingBalance(186.17, 185.17, checked, now)).toBe(true);
  });
  it('accepts the payment reducing the balance to $185.17', () => {
    expect(acceptBillingBalance(185.17, 352.94, checked, now)).toBe(true);
  });
  it('rearms after a $195 payment even if the balance stays above $250', () => {
    expect(isPaymentDrop(300, 495)).toBe(true);
    expect(isPaymentDrop(352.94, 369.48)).toBe(false);
  });
  it('rejects malformed balances rather than sending a misleading SMS', () => {
    expect(acceptBillingBalance(NaN, 185.17, checked, now)).toBe(false);
    expect(acceptBillingBalance(-1, 185.17, checked, now)).toBe(false);
  });
});