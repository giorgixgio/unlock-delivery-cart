

## Create "OTHER" Batch for 14 R1 Orders

### Step 1: Add `name` column to `batches` table

Run a migration to add an optional `name` text column to the `batches` table so batches can be labeled (e.g., "OTHER").

```sql
ALTER TABLE public.batches ADD COLUMN name text;
```

### Step 2: Create the batch with all 14 orders

Insert a new batch record with `name = 'OTHER'`, then link all 14 orders via `batch_orders`, create the item snapshot from `order_items`, and update `orders.batch_id`.

The 14 orders (all R1 re-shipments, currently `shipped`):

| Order | Customer | Tracking |
|-------|----------|----------|
| 100216-R1 | ბაბუში | 105312303 |
| 100220-R1 | იოანე | 105312306 |
| 100221-R1 | უჩა | 105312288 |
| 100238-R1 | Niko | 105312323 |
| 100239-R1 | თამარ იმნაიშვილი | 105312314 |
| 100242-R1 | რეზო ჯინჭარაძე | 105312304 |
| 100243-R1 | Dimitri | 105312324 |
| 100245-R1 | ხატია | 105312305 |
| 100251-R1 | Giga | 105312328 |
| 100270-R1 | ლაშა | 105312340 |
| 100271-R1 | გალუსტ | 105312338 |
| 100275-R1 | Aleksandre | 105312330 |
| 100276-R1 | Aleksandre | 105312312 |
| 100279-R1 | მიხეილ ქვარიანი | 105312321 |

### Step 3: Update UI to display batch name

- **AdminBatches.tsx**: Show the `name` column in the batch list table (next to batch ID)
- **AdminBatchDetail.tsx**: Show the batch name in the header
- **batchService.ts**: Update `createBatchFromOrderIds` to accept an optional `name` parameter

### Technical Details

- Migration adds nullable `name` column (no breaking change)
- Batch will be created via direct SQL insert + the existing `createBatchFromOrderIds` pattern
- The batch name will display as a bold label in the list, falling back to the truncated UUID if no name is set

