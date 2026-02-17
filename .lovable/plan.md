

# Refine and Stabilize Warehouse Batch System

## Summary

This plan changes the batch system from "auto-release on print" to an explicit "Bulk Release" flow, adds an "Undo Release" admin action, and tightens eligibility checks and anti-duplicate protections.

## Changes

### 1. Service Layer (`src/lib/batchService.ts`)

**Print logic -- remove auto-release:**
- `printPackingList` and `printPackingSlips` will no longer set status to RELEASED or stamp `released_at` on orders.
- They will only: increment counts, set printed_at/by, transition OPEN to LOCKED on first print, and log the event.

**New function: `bulkReleaseBatch(batchId, actorEmail)`**
- Validates batch has orders and status is not already RELEASED.
- Sets `batch.status = "RELEASED"`, `released_at`, `released_by`.
- Updates `orders.released_at = now()` for all batch orders.
- Logs `BULK_RELEASE` event with `{ order_count }`.

**New function: `undoReleaseBatch(batchId, actorEmail, reason)`**
- Only allowed when `batch.status === "RELEASED"`.
- Sets `batch.status = "LOCKED"`, clears `released_at`/`released_by`.
- Clears `orders.released_at` for all batch orders.
- Logs `UNDO_RELEASE` event with `{ reason }`.

**Tighten `createBatch` eligibility:**
- Remove `is_fulfilled` filter (not relevant to the new model).
- Keep: `status = 'confirmed'`, `is_confirmed = true`, `batch_id IS NULL`, `released_at IS NULL`, exclude `merged`/`canceled`.

**New function: `fetchEligibleOrderCount()`**
- Returns `{ eligible: number, ineligible: { reason: string, count: number }[] }` for display in the Create Batch modal.

### 2. Batch Detail Page (`src/pages/admin/AdminBatchDetail.tsx`)

**Add "Bulk Release Orders" button:**
- Visible when `batch.status !== "RELEASED"`.
- Shows confirmation dialog with order count before executing.
- Calls `bulkReleaseBatch`.

**Add "Undo Release" button:**
- Visible only when `batch.status === "RELEASED"`.
- Requires a text reason input in a confirmation modal.
- Calls `undoReleaseBatch`.
- Shows a warning banner when batch has been un-released (detected via `UNDO_RELEASE` event in history).

**Disable actions when RELEASED:**
- All modification actions disabled.
- Print/PDF buttons remain but show reprint confirmation.

**Warning banners (already partially implemented, will refine):**
- OPEN for over 2 hours.
- LOCKED but not yet released.
- RELEASED but slips not printed.
- Release was undone (UNDO_RELEASE event exists).

### 3. Batches List Page (`src/pages/admin/AdminBatches.tsx`)

**Create Batch flow improvement:**
- Before creating, fetch eligible/ineligible counts and show a summary modal.
- If no eligible orders, disable button with explanation.

### 4. Anti-Duplicate Protection

All protections are already enforced by the eligibility query (`batch_id IS NULL AND released_at IS NULL`). The service functions will be reviewed to ensure:
- No order can enter two batches.
- No released order can be re-batched.
- Batch composition cannot change when status is not OPEN.

---

## Technical Details

### Files to modify

| File | Changes |
|---|---|
| `src/lib/batchService.ts` | Remove auto-release from print functions; add `bulkReleaseBatch`, `undoReleaseBatch`, `fetchEligibleOrderCount`; tighten `createBatch` |
| `src/pages/admin/AdminBatchDetail.tsx` | Add Bulk Release button + confirmation; add Undo Release button + reason modal; add undo-release warning banner; disable edits when RELEASED |
| `src/pages/admin/AdminBatches.tsx` | Add eligibility summary modal before batch creation |

### No database changes needed

All required tables and columns already exist. The logic changes are purely in the application layer.

