

## Create Batch for Last 15 Confirmed Orders

### What will happen

Create a new batch containing these 15 confirmed orders (newest first):

| # | Order | Customer |
|---|-------|----------|
| 1 | 100364 | Nona |
| 2 | 100363 | როენა |
| 3 | 100362 | nino |
| 4 | 100361 | როენა |
| 5 | 100360 | გიორგი |
| 6 | 100359 | გულნარა შენგელია |
| 7 | 100358 | Vano |
| 8 | 100357 | ინგა |
| 9 | 100356 | ნანიკო |
| 10 | 100355 | ივანე |
| 11 | 100354 | თამთა ხარაბაძე |
| 12 | 100353 | ლედი |
| 13 | 100352 | Ხარება |
| 14 | 100351 | მედეა |
| 15 | 100350 | რომანი |

All are `confirmed`, `is_confirmed = true`, no batch assigned, no tracking yet.

### Technical Steps

1. Insert a new row in `batches` table (status: OPEN)
2. Insert 15 rows in `batch_orders` linking each order to the batch
3. Snapshot all order items into `batch_order_items_snapshot`
4. Update `orders.batch_id` for all 15 orders
5. Log a `BATCH_CREATED` event in `batch_events`

All done via direct SQL inserts (no code changes needed).

