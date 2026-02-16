import type { StickerOrder } from "./StickerPrintView";

const BATCH_SIZE = 15;

interface SkuEntry {
  sku: string;
  orders: { orderNumber: string; qty: number }[];
  totalQty: number;
}

export function openPackingListWindow(orders: StickerOrder[]) {
  // Split into batches, sorting within each batch by SKU to minimize warehouse trips
  const batches: StickerOrder[][] = [];
  
  // Sort all orders by their lowest SKU first for better batching
  const sorted = [...orders].sort((a, b) => {
    const minSkuA = Math.min(...a.items.map(i => parseInt(i.sku) || 99999));
    const minSkuB = Math.min(...b.items.map(i => parseInt(i.sku) || 99999));
    return minSkuA - minSkuB;
  });

  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    batches.push(sorted.slice(i, i + BATCH_SIZE));
  }

  const today = new Date().toLocaleDateString("ka-GE");
  const totalOrders = orders.length;

  const batchesHtml = batches.map((batch, bIdx) => {
    // Group by SKU within this batch
    const skuMap = new Map<string, { orderNumber: string; qty: number }[]>();
    for (const order of batch) {
      for (const item of order.items) {
        if (!skuMap.has(item.sku)) skuMap.set(item.sku, []);
        skuMap.get(item.sku)!.push({
          orderNumber: order.publicOrderNumber,
          qty: item.quantity,
        });
      }
    }

    // Sort SKUs numerically
    const skuEntries: SkuEntry[] = Array.from(skuMap.entries())
      .map(([sku, ords]) => ({
        sku,
        orders: ords,
        totalQty: ords.reduce((s, o) => s + o.qty, 0),
      }))
      .sort((a, b) => (parseInt(a.sku) || 99999) - (parseInt(b.sku) || 99999));

    return `
      <div class="batch" ${bIdx > 0 ? 'style="page-break-before: always;"' : ''}>
        <div class="batch-header">
          <strong>Batch ${bIdx + 1} / ${batches.length}</strong>
          <span>${batch.length} orders</span>
        </div>
        <div class="batch-orders">
          შეკვეთები: ${batch.map(o => `#${o.publicOrderNumber}`).join(", ")}
        </div>
        <table>
          <thead>
            <tr>
              <th class="sku-col">SKU (პოზიცია)</th>
              <th>შეკვეთები</th>
              <th class="qty-col">სულ</th>
            </tr>
          </thead>
          <tbody>
            ${skuEntries.map(entry => `
              <tr>
                <td class="sku-cell">
                  <span class="sku-num">${entry.sku}</span>
                  <span class="carton-label">ყუთი ${entry.sku}</span>
                </td>
                <td class="orders-cell">
                  ${entry.orders.map(o => `<span class="order-chip">#${o.orderNumber} ×${o.qty}</span>`).join(" ")}
                </td>
                <td class="qty-cell">${entry.totalQty}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Packing List - ${today}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11pt; }
  .header {
    text-align: center;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 3px solid #000;
  }
  .header h1 { font-size: 18pt; }
  .header .meta { font-size: 9pt; color: #666; margin-top: 4px; }
  .batch {
    margin-bottom: 30px;
  }
  .batch-header {
    background: #222;
    color: #fff;
    padding: 8px 14px;
    font-size: 13pt;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 4px 4px 0 0;
  }
  .batch-orders {
    background: #f5f5f5;
    padding: 6px 14px;
    font-size: 9pt;
    color: #555;
    border: 1px solid #ddd;
    border-top: none;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #ddd;
    border-top: none;
  }
  th {
    background: #f0f0f0;
    text-align: left;
    padding: 8px 12px;
    font-size: 10pt;
    border-bottom: 2px solid #ccc;
  }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; vertical-align: middle; }
  tr:hover { background: #fafafa; }
  .sku-col { width: 140px; }
  .qty-col { width: 60px; text-align: center; }
  .sku-cell { }
  .sku-num {
    display: block;
    font-size: 16pt;
    font-weight: 900;
    color: #111;
  }
  .carton-label {
    display: block;
    font-size: 8pt;
    color: #888;
  }
  .orders-cell { font-size: 10pt; }
  .order-chip {
    display: inline-block;
    background: #e8f5e9;
    border: 1px solid #c8e6c9;
    border-radius: 3px;
    padding: 2px 6px;
    margin: 2px 3px;
    font-size: 9pt;
    font-weight: 600;
  }
  .qty-cell {
    text-align: center;
    font-weight: bold;
    font-size: 13pt;
  }
  @media print {
    body { padding: 10px; }
    .batch-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .order-chip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>📦 PACKING LIST — BIGMART</h1>
    <div class="meta">${today} | ${totalOrders} orders | ${batches.length} batches</div>
  </div>
  ${batchesHtml}
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
