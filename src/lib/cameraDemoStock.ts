export const CAMERA_DEMO_START_STOCK = 50;
export const CAMERA_DEMO_MIN_STOCK = 40;
export interface CameraDemoStockState { remaining: number; drops: number; }
export function nextCameraDemoStock(state: CameraDemoStockState): CameraDemoStockState {
 const amount = state.drops % 3 + 1;
 return { remaining: Math.max(CAMERA_DEMO_MIN_STOCK, state.remaining - amount), drops: state.drops + 1 };
}
export function cameraDemoFill(remaining: number) { return (200 - remaining) / 200; }
export function initialCameraDemoStock(): CameraDemoStockState {
 return { remaining: CAMERA_DEMO_START_STOCK, drops: 0 };
}