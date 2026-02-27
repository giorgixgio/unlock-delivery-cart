import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

interface SkuEntry {
  sku: string;
  orders: { orderNumber: string; qty: number }[];
  totalQty: number;
}

interface StickerOrder {
  orderId: string;
  publicOrderNumber: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  tracking: string;
  items: { sku: string; quantity: number; title: string }[];
}

const BATCH_SIZE = 20;

export default function AdminPackingList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<StickerOrder[] | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("__packing_list_data");
      if (raw) {
        setOrders(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  if (!orders) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-lg font-medium">No packing list data found.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  // Sort orders by lowest SKU for better batching
  const sorted = [...orders].sort((a, b) => {
    const minSkuA = Math.min(...a.items.map(i => parseInt(i.sku) || 99999));
    const minSkuB = Math.min(...b.items.map(i => parseInt(i.sku) || 99999));
    return minSkuA - minSkuB;
  });

  const batches: StickerOrder[][] = [];
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    batches.push(sorted.slice(i, i + BATCH_SIZE));
  }

  const today = new Date().toLocaleDateString("ka-GE");

  return (
    <div className="min-h-screen bg-white">
      {/* Toolbar — hidden on print */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> Print
        </Button>
      </div>

      {/* Content */}
      <div ref={contentRef} className="max-w-[800px] mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="text-center mb-6 pb-3 border-b-[3px] border-black">
          <h1 className="text-xl sm:text-2xl font-bold">📦 PACKING LIST — BIGMART</h1>
          <p className="text-xs text-gray-500 mt-1">
            {today} | {orders.length} orders | {batches.length} batches
          </p>
        </div>

        {batches.map((batch, bIdx) => {
          // Group by SKU within batch
          const skuMap = new Map<string, { orderNumber: string; qty: number }[]>();
          const skuOrder: string[] = []; // track insertion order
          for (const order of batch) {
            for (const item of order.items) {
              if (!skuMap.has(item.sku)) { skuMap.set(item.sku, []); skuOrder.push(item.sku); }
              skuMap.get(item.sku)!.push({
                orderNumber: order.publicOrderNumber,
                qty: item.quantity,
              });
            }
          }

          const skuEntries: SkuEntry[] = Array.from(skuMap.entries())
            .map(([sku, ords]) => ({
              sku,
              orders: ords,
              totalQty: ords.reduce((s, o) => s + o.qty, 0),
            }))
            .sort((a, b) => (parseInt(a.sku) || 99999) - (parseInt(b.sku) || 99999));

          const sortedSkuList = skuEntries.map(e => e.sku);

          // For each order, find its LAST SKU in sorted order — that's where it completes
          const orderCompletionSku = new Map<string, string>();
          for (const order of batch) {
            const orderSkus = order.items.map(i => i.sku);
            let lastIdx = -1;
            let lastSku = "";
            for (const sku of orderSkus) {
              const idx = sortedSkuList.indexOf(sku);
              if (idx > lastIdx) { lastIdx = idx; lastSku = sku; }
            }
            if (lastSku) orderCompletionSku.set(order.publicOrderNumber, lastSku);
          }

          return (
            <div key={bIdx} className={`mb-8 ${bIdx > 0 ? "break-before-page" : ""}`}>
              {/* Batch header */}
              <div className="bg-gray-900 text-white px-4 py-2 flex justify-between items-center rounded-t text-sm sm:text-base font-semibold print:bg-gray-900 print:text-white" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                <span>Batch {bIdx + 1} / {batches.length}</span>
                <span>{batch.length} orders</span>
              </div>

              {/* Order numbers */}
              <div className="bg-gray-100 px-4 py-1.5 text-xs text-gray-600 border border-t-0 border-gray-300">
                შეკვეთები: {batch.map(o => `#${o.publicOrderNumber}`).join(", ")}
              </div>

              {/* SKU table */}
              <table className="w-full border-collapse border border-t-0 border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 border-b-2 border-gray-300 w-[120px] sm:w-[140px] text-xs sm:text-sm">SKU (პოზიცია)</th>
                    <th className="text-left px-3 py-2 border-b-2 border-gray-300 text-xs sm:text-sm">შეკვეთები</th>
                    <th className="text-center px-3 py-2 border-b-2 border-gray-300 w-[50px] sm:w-[60px] text-xs sm:text-sm">სულ</th>
                  </tr>
                </thead>
                <tbody>
                  {skuEntries.map(entry => {
                    // Find orders that COMPLETE at this SKU
                    const completingOrders = new Set<string>();
                    for (const [orderNum, completeSku] of orderCompletionSku) {
                      if (completeSku === entry.sku) completingOrders.add(orderNum);
                    }

                    return (
                      <tr key={entry.sku} className="hover:bg-gray-50 border-b border-gray-200">
                        <td className="px-3 py-2.5 align-middle">
                          <span className="block text-lg sm:text-xl font-black text-gray-900">{entry.sku}</span>
                          <span className="block text-[10px] text-gray-400">ყუთი {entry.sku}</span>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex flex-wrap gap-1">
                            {entry.orders.map((o, i) => {
                              const isComplete = completingOrders.has(o.orderNumber);
                              return (
                                <span
                                  key={i}
                                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-semibold border ${
                                    isComplete
                                      ? "bg-yellow-100 border-yellow-400 text-yellow-900"
                                      : "bg-green-50 border-green-200"
                                  }`}
                                  style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                                >
                                  #{o.orderNumber} ×{o.qty}{isComplete && " ✅"}
                                </span>
                              );
                            })}
                          </div>
                          {completingOrders.size > 0 && (
                            <div className="mt-1 text-[9px] sm:text-[10px] text-yellow-800 font-bold" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                              ⬆ გადაყარე: {Array.from(completingOrders).map(n => `#${n}`).join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-base sm:text-lg align-middle">{entry.totalQty}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
