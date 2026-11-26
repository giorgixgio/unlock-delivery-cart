export function payoutAdjustments(pendingPayout: number, paidFailedFees = 0) {
  return [
    { label: "Less: pending payout", amount: -Number(pendingPayout) },
    { label: "Less: paid failed-delivery fees", amount: -Number(paidFailedFees) },
  ];
}

export function reconcilePaidPayout(deliveredPayout: number, pendingPayout: number, paidFailedFees: number): number {
  return Number((deliveredPayout - pendingPayout - paidFailedFees).toFixed(2));
}