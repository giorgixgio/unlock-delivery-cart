INSERT INTO batch_order_items_snapshot (batch_id, order_id, sku, product_name, qty)
SELECT bo.batch_id, bo.order_id, oi.sku, oi.title, oi.quantity
FROM batch_orders bo
JOIN order_items oi ON oi.order_id = bo.order_id::uuid
WHERE bo.batch_id IN ('b1a00001-0000-0000-0000-000000000001', 'b1a00002-0000-0000-0000-000000000002')