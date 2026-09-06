import ExcelJS from "exceljs";
import type { CustomsDocSettings } from "./customsDocSettings";

/**
 * Packing list / invoice spreadsheet reproducing the forwarder's Russian
 * customs template row-for-row, plus two extra columns (SKU, Cartons).
 *
 * Column map:
 *  A №  | B SKU | C Наименование | D Код товара | E Мест (merged total)
 *  F Cartons | G Количество | H Брутто Kg | I Нетто Kg
 *  J Цена за единицу USD | K Сумма USD
 */

/** Gross weight uplift used by the forwarder's template. */
const GROSS_FACTOR = 1.017763;

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
  settings: CustomsDocSettings;
};

/** Customs wants HS codes without separators. */
export const dotlessHs = (v: string | null) => (v ? v.replace(/\D+/g, "") : "");

const THIN = { style: "thin" as const, color: { argb: "FF999999" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const FONT = { name: "Arial", size: 10 };

const num = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);

const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

/** Best-effort invoice sequence number derived from the batch number. */
export const invoiceNumber = (batchNumber: string, prefix: string) => {
  const digits = (batchNumber || "").replace(/\D+/g, "");
  return `${prefix || "G888"}-T${digits || "1"}`;
};

export async function buildPackingListWorkbook(items: XlsxItem[], meta: XlsxMeta): Promise<Blob> {
  const s = meta.settings;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wholesale CRM";
  wb.created = new Date();
  const ws = wb.addWorksheet("Packing list");

  ws.columns = [
    { width: 5 },   // A №
    { width: 12 },  // B SKU
    { width: 42 },  // C Наименование
    { width: 16 },  // D Код товара
    { width: 10 },  // E Мест
    { width: 10 },  // F Cartons
    { width: 12 },  // G Количество
    { width: 13 },  // H Брутто
    { width: 13 },  // I Нетто
    { width: 16 },  // J Цена
    { width: 15 },  // K Сумма
  ];

  const set = (addr: string, value: unknown, opts?: { bold?: boolean; size?: number; center?: boolean }) => {
    const c = ws.getCell(addr);
    c.value = value as never;
    c.font = { ...FONT, size: opts?.size ?? 10, bold: !!opts?.bold };
    if (opts?.center) c.alignment = { horizontal: "center", vertical: "middle" };
    return c;
  };

  /* ── header block ── */
  ws.mergeCells("B2:K2");
  set("B2", s.sellerName, { bold: true, size: 12 });
  ws.mergeCells("B3:K3");
  set("B3", s.sellerAddress);

  ws.mergeCells("C4:I4");
  set("C4", "INVOICE", { bold: true, size: 14, center: true });

  set("B5", `Invoice no: ${invoiceNumber(meta.batchNumber, s.invoicePrefix)}`);
  set("F5", `Invoice дата: ${ddmmyyyy(new Date())}`);

  set("B7", `Получатель: ${s.receiverName}`);
  set("B8", `code: ${s.receiverCode}`);
  set("B9", `Адрес: ${s.receiverAddress}`);
  set("F9", `Условия поставки: ${s.incoterms}`);

  /* ── table header (row 11) ── */
  const HEAD = [
    "№",
    "SKU",
    "Наименование",
    "Код товара",
    "Мест",
    "Cartons",
    "Количество",
    "Брутто Kg",
    "Нетто Kg",
    "Цена за единицу USD",
    "Сумма USD",
  ];
  HEAD.forEach((h, i) => {
    const c = ws.getRow(11).getCell(i + 1);
    c.value = h;
    c.font = { ...FONT, bold: true };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    c.border = BORDER;
  });

  /* ── data rows ── */
  const FIRST = 12;
  const cartonsTotal = items.reduce((sum, i) => sum + num(i.carton_count), 0);

  items.forEach((it, idx) => {
    const rowNum = FIRST + idx;
    const row = ws.getRow(rowNum);
    const qty = num(it.quantity);
    const net = qty * num(it.weight_kg);

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = it.sku;
    row.getCell(3).value = it.title_ru || it.title || "";
    row.getCell(4).value = dotlessHs(it.hs_code);
    row.getCell(5).value = idx === 0 ? cartonsTotal : null;
    row.getCell(6).value = num(it.carton_count);
    row.getCell(7).value = qty;
    row.getCell(8).value = net * GROSS_FACTOR;
    row.getCell(9).value = net;
    row.getCell(10).value = num(it.unit_price);
    row.getCell(11).value = { formula: `G${rowNum}*J${rowNum}` };

    for (let col = 1; col <= 11; col++) {
      const c = row.getCell(col);
      c.font = FONT;
      c.border = BORDER;
      c.alignment = {
        vertical: "middle",
        horizontal: col === 3 ? "left" : "center",
        wrapText: col === 3,
      };
      if (col === 8 || col === 9) c.numFmt = "0.000";
      if (col === 10 || col === 11) c.numFmt = "#,##0.00";
    }
    row.commit?.();
  });

  const LAST = FIRST + items.length - 1;
  // "Мест" is a shipment-wide total: one true merged cell spanning all item rows.
  if (items.length > 1) ws.mergeCells(`E${FIRST}:E${LAST}`);
  if (items.length) {
    ws.getCell(`E${FIRST}`).alignment = { vertical: "middle", horizontal: "center" };
  }

  /* ── spacer, totals values, totals labels ── */
  const spacer = LAST + 1;
  const totalsRow = spacer + 1;
  const labelsRow = totalsRow + 1;

  const tv = ws.getRow(totalsRow);
  tv.getCell(5).value = cartonsTotal;
  tv.getCell(8).value = { formula: `SUM(H${FIRST}:H${LAST})` };
  tv.getCell(9).value = { formula: `SUM(I${FIRST}:I${LAST})` };
  tv.getCell(11).value = { formula: `SUM(K${FIRST}:K${LAST})` };
  [5, 8, 9, 11].forEach((col) => {
    const c = tv.getCell(col);
    c.font = { ...FONT, bold: true };
    c.border = BORDER;
    c.alignment = { horizontal: "center", vertical: "middle" };
    if (col === 8 || col === 9) c.numFmt = "0.000";
    if (col === 11) c.numFmt = "#,##0.00";
  });

  const tl = ws.getRow(labelsRow);
  tl.getCell(3).value = "TOTAL:";
  tl.getCell(5).value = " Мест";
  tl.getCell(8).value = "Kg";
  tl.getCell(9).value = " Kg";
  tl.getCell(11).value = "USD";
  [3, 5, 8, 9, 11].forEach((col) => {
    const c = tl.getCell(col);
    c.font = { ...FONT, bold: true };
    c.alignment = { horizontal: col === 3 ? "right" : "center", vertical: "middle" };
  });

  /* ── stamp ── */
  const signRow = labelsRow + 2;
  set(`C${signRow}`, "Подпись и печать / Signature and stamp");
  if (meta.stampDataUrl) {
    try {
      const base64 = meta.stampDataUrl.split(",")[1] ?? "";
      const imageId = wb.addImage({ base64, extension: "png" });
      ws.addImage(imageId, { tl: { col: 2, row: signRow }, ext: { width: 150, height: 150 } });
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
  const missing = (pred: (i: XlsxItem) => boolean) => items.filter(pred).map((i) => i.sku || "(no SKU)");
  const out: string[] = [];
  const w = missing((i) => !i.weight_kg);
  const p = missing((i) => !i.unit_price);
  const h = missing((i) => !dotlessHs(i.hs_code));
  const c = missing((i) => !i.carton_count);
  const cap = (list: string[]) => `${list.slice(0, 8).join(", ")}${list.length > 8 ? "…" : ""}`;
  if (w.length) out.push(`Missing weight: ${cap(w)}`);
  if (p.length) out.push(`Missing unit price: ${cap(p)}`);
  if (h.length) out.push(`Missing HS code: ${cap(h)}`);
  if (c.length) out.push(`Missing cartons: ${cap(c)}`);
  return out;
}
