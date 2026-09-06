import ExcelJS from "exceljs";

/**
 * Packing list / invoice spreadsheet in the Russian customs template used by
 * our forwarder. Replaces the previous PDF packing list.
 *
 * Company details live in PARTIES so an operator-facing change is one edit.
 */

export const PARTIES = {
  seller: {
    name: "Продавец: TRENDMART LLC",
    address: "Адрес: Georgia, Tbilisi",
  },
  receiver: {
    name: "Получатель: BIGMART LLC",
    address: "Адрес: Georgia, Tbilisi",
  },
};

export type XlsxItem = {
  sku: string;
  title: string | null;
  title_ru: string | null;
  quantity: number | null;
  unit_price: number | null;
  weight_kg: number | null;
  carton_count: number | null;
  hs_code: string | null;
};

export type XlsxMeta = {
  batchNumber: string;
  warehouse: "A" | "B";
  /** PNG data URL of the warehouse stamp, placed under the totals. */
  stampDataUrl?: string | null;
};

/** Customs wants HS codes without separators. */
export const dotlessHs = (v: string | null) => (v ? v.replace(/\D+/g, "") : "");

const THIN = { style: "thin" as const, color: { argb: "FF999999" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

export async function buildPackingListWorkbook(items: XlsxItem[], meta: XlsxMeta): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wholesale CRM";
  wb.created = new Date();
  const ws = wb.addWorksheet("Packing list");

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 46 },
    { width: 16 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const cartonsTotal = items.reduce((s, i) => s + (i.carton_count ?? 0), 0);

  const titleRow = (text: string, bold = true, size = 11) => {
    const r = ws.addRow([text]);
    ws.mergeCells(`A${r.number}:H${r.number}`);
    r.getCell(1).font = { name: "Arial", size, bold };
    return r;
  };

  titleRow("УПАКОВОЧНЫЙ ЛИСТ / ИНВОЙС", true, 14);
  titleRow(PARTIES.seller.name);
  titleRow(PARTIES.seller.address, false);
  titleRow(PARTIES.receiver.name);
  titleRow(PARTIES.receiver.address, false);
  titleRow(`Инвойс №: ${meta.batchNumber}`, false);
  titleRow(`Дата: ${today}`, false);
  titleRow(`Склад: ${meta.warehouse}`, false);
  titleRow(`Всего мест (коробок): ${cartonsTotal}`, false);
  ws.addRow([]);

  const head = ws.addRow([
    "№",
    "Артикул",
    "Наименование товара",
    "Код ТН ВЭД",
    "Кол-во",
    "Вес (кг)",
    "Цена (USD)",
    "Сумма (USD)",
  ]);
  head.eachCell((c) => {
    c.font = { name: "Arial", size: 10, bold: true };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    c.border = BORDER;
  });

  const firstDataRow = head.number + 1;
  items.forEach((it, idx) => {
    const qty = it.quantity ?? 0;
    const row = ws.addRow([
      idx + 1,
      it.sku,
      it.title_ru || it.title || "",
      dotlessHs(it.hs_code),
      qty,
      (it.weight_kg ?? 0) * qty,
      it.unit_price ?? 0,
      null,
    ]);
    row.getCell(8).value = { formula: `E${row.number}*G${row.number}` };
    row.eachCell((c, col) => {
      c.font = { name: "Arial", size: 10 };
      c.border = BORDER;
      c.alignment = { vertical: "middle", horizontal: col === 3 ? "left" : "center", wrapText: col === 3 };
      if (col === 6) c.numFmt = "0.000";
      if (col === 7 || col === 8) c.numFmt = "#,##0.00";
    });
  });

  const lastDataRow = firstDataRow + items.length - 1;
  const totals = ws.addRow([
    "",
    "",
    "ИТОГО",
    "",
    { formula: `SUM(E${firstDataRow}:E${lastDataRow})` },
    { formula: `SUM(F${firstDataRow}:F${lastDataRow})` },
    "",
    { formula: `SUM(H${firstDataRow}:H${lastDataRow})` },
  ]);
  totals.eachCell((c, col) => {
    c.font = { name: "Arial", size: 10, bold: true };
    c.border = BORDER;
    c.alignment = { vertical: "middle", horizontal: col === 3 ? "right" : "center" };
    if (col === 6) c.numFmt = "0.000";
    if (col === 8) c.numFmt = "#,##0.00";
  });

  ws.addRow([]);
  const sign = ws.addRow(["", "", "Подпись и печать / Signature and stamp"]);
  sign.getCell(3).font = { name: "Arial", size: 10 };

  if (meta.stampDataUrl) {
    try {
      const base64 = meta.stampDataUrl.split(",")[1] ?? "";
      const imageId = wb.addImage({ base64, extension: "png" });
      ws.addImage(imageId, {
        tl: { col: 2, row: sign.number },
        ext: { width: 150, height: 150 },
      });
    } catch {
      /* stamp is optional — never block document generation */
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Human-readable warnings about data the customs template expects. */
export function packingListWarnings(items: XlsxItem[]): string[] {
  const missing = (pred: (i: XlsxItem) => boolean) => items.filter(pred).map((i) => i.sku);
  const out: string[] = [];
  const w = missing((i) => !i.weight_kg);
  const p = missing((i) => !i.unit_price);
  const h = missing((i) => !dotlessHs(i.hs_code));
  const c = items.reduce((s, i) => s + (i.carton_count ?? 0), 0);
  if (w.length) out.push(`Missing weight: ${w.slice(0, 8).join(", ")}${w.length > 8 ? "…" : ""}`);
  if (p.length) out.push(`Missing unit price: ${p.slice(0, 8).join(", ")}${p.length > 8 ? "…" : ""}`);
  if (h.length) out.push(`Missing HS code: ${h.slice(0, 8).join(", ")}${h.length > 8 ? "…" : ""}`);
  if (!c) out.push("No carton counts set — shipment carton total is 0");
  return out;
}
