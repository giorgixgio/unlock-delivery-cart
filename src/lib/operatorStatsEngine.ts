export const WORK_BREAK_MINUTES = 15;

export interface TimedAction {
  operator: string;
  at: string;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Active work is the time between nearby actions, plus two minutes after the last action each day. */
export function workedSeconds(actions: TimedAction[], breakMinutes = WORK_BREAK_MINUTES): number {
  const byDay = new Map<string, number[]>();
  for (const action of actions) {
    const time = new Date(action.at).getTime();
    if (!Number.isFinite(time)) continue;
    const day = action.at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(time);
    byDay.set(day, list);
  }
  let total = 0;
  const breakMs = breakMinutes * 60_000;
  for (const times of byDay.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i += 1) {
      const gap = times[i] - times[i - 1];
      if (gap <= breakMs) total += gap / 1000;
    }
    if (times.length) total += 120;
  }
  return total;
}

export function attemptsPerResolved(calls: { orderId: string; outcome: string }[]): number {
  const resolved = new Set(calls.filter((call) => call.outcome === "confirmed" || call.outcome === "cancelled").map((call) => call.orderId));
  if (!resolved.size) return 0;
  return calls.filter((call) => resolved.has(call.orderId)).length / resolved.size;
}

export interface CapacityInput {
  targetLeads: number;
  autoConfirmShare: number;
  minutesPerLeadNeedingOperator: number;
  shiftHours: number;
  targetUtilization: number;
}

export function calculateCapacity(input: CapacityInput) {
  const needingOperator = input.targetLeads * Math.max(0, 1 - input.autoConfirmShare);
  const operatorHours = needingOperator * input.minutesPerLeadNeedingOperator / 60;
  const usableHoursPerOperator = input.shiftHours * Math.max(0.01, input.targetUtilization);
  return {
    leadsNeedingOperator: needingOperator,
    operatorHours,
    operatorsNeeded: Math.ceil(operatorHours / usableHoursPerOperator),
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}