export const CAMERA_DEMO_START_STOCK = 50;
export const CAMERA_DEMO_MIN_STOCK = 8;
export interface CameraDemoStockState { remaining: number; drops: number; }
export function nextCameraDemoStock(state: CameraDemoStockState): CameraDemoStockState {
 const amount = state.drops % 3 + 1;
 return { remaining: Math.max(CAMERA_DEMO_MIN_STOCK, state.remaining - amount), drops: state.drops + 1 };
}
export function cameraDemoFill(remaining: number) { return (200 - remaining) / 200; }
export function readCameraDemoStock(raw: string | null): CameraDemoStockState {
 try {
  const value = JSON.parse(raw ?? 'null');
  if (Number.isInteger(value?.remaining) && value.remaining >= CAMERA_DEMO_MIN_STOCK && value.remaining <= CAMERA_DEMO_START_STOCK && Number.isInteger(value.drops) && value.drops >= 0) return value;
 } catch { /* A blocked or invalid stored demo never affects checkout. */ }
 return { remaining: CAMERA_DEMO_START_STOCK, drops: 0 };
}