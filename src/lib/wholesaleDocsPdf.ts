import jsPDF from "jspdf";
import { loadGeorgianFont } from "@/components/CourierLabel";

/**
 * Wholesale customs paperwork (commercial invoice + packing list).
 *
 * Standalone from the courier thermal-label generator: same jsPDF + Noto Sans
 * Georgian vector-text pattern, A4 pages, optional company stamp overlay.
 */

export type DocItem = {
  sku: string;
  title: string | null;
  quantity: number | null;
  unit_price: number | null;
  weight_kg: number | null;
  carton_count: number | null;
};

export type DocMeta = {
  batchNumber: string;
  warehouse: "A" | "B";
  /** Base64 data URL (PNG) of the company stamp for this warehouse. */
  stampDataUrl?: string | null;
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;

function registerFont(pdf: jsPDF, font: { regular: string; bold: string }) {
  pdf.addFileToVFS("WhNotoSansGeorgian-Regular.ttf", font.regular);
  pdf.addFont("WhNotoSansGeorgian-Regular.ttf", "WhNotoGeo", "normal");
  pdf.addFileToVFS("WhNotoSansGeorgian-Bold.ttf", font.bold);
  pdf.addFont("WhNotoSansGeorgian-Bold.ttf", "WhNotoGeo", "bold");
}

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function header(pdf: jsPDF, title: string, meta: DocMeta) {
  pdf.setFont("WhNotoGeo", "bold");
  pdf.setFontSize(18);
  pdf.text(title, M, 20);

  pdf.setFont("WhNotoGeo", "normal");
  pdf.setFontSize(10);
  pdf.text(`Batch: ${meta.batchNumber}`, M, 28);
  pdf.text(`Warehouse: ${meta.warehouse}`, M, 33.5);
  pdf.text(`Date: ${new Date().toISOString().slice(0, 10)}`, PAGE_W - M, 28, { align: "right" });

  pdf.setDrawColor(180);
  pdf.line(M, 38, PAGE_W - M, 38);
}

function stamp(pdf: jsPDF, meta: DocMeta) {
  if (!meta.stampDataUrl) return;
  try {
    pdf.addImage(meta.stampDataUrl, "PNG", PAGE_W - M - 45, PAGE_H - M - 45, 45, 45);
  } catch {
    /* stamp is optional — never block document generation */
  }
}

function ensureRoom(pdf: jsPDF, y: number, drawHead: (y: number) => number): number {
  if (y < PAGE_H - 40) return y;
  pdf.addPage();
  return drawHead(20);
}

/** Commercial invoice: SKU, title, qty, unit price, line total + grand totals. */
export async function buildWholesaleInvoice(items: DocItem[], meta: DocMeta): Promise<jsPDF> {
  const font = await loadGeorgianFont();
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  registerFont(pdf, font);

  header(pdf, "COMMERCIAL INVOICE", meta);

  const cols = { sku: M, title: M + 30, qty: 132, price: 156, total: PAGE_W - M };

  const tableHead = (y: number) => {
    pdf.setFont("WhNotoGeo", "bold");
    pdf.setFontSize(9);
    pdf.text("SKU", cols.sku, y);
    pdf.text("Description", cols.title, y);
    pdf.text("Qty", cols.qty, y, { align: "right" });
    pdf.text("Unit price", cols.price, y, { align: "right" });
    pdf.text("Line total", cols.total, y, { align: "right" });
    pdf.setDrawColor(210);
    pdf.line(M, y + 2, PAGE_W - M, y + 2);
    pdf.setFont("WhNotoGeo", "normal");
    return y + 8;
  };

  let y = tableHead(46);
  let grand = 0;
  let weight = 0;
  let qtyTotal = 0;

  for (const it of items) {
    y = ensureRoom(pdf, y, (ny) => {
      header(pdf, "COMMERCIAL INVOICE", meta);
      return tableHead(ny + 26);
    });
    const qty = it.quantity ?? 1;
    const price = it.unit_price ?? 0;
    const line = qty * price;
    grand += line;
    qtyTotal += qty;
    weight += (it.weight_kg ?? 0) * qty;

    pdf.setFontSize(9);
    pdf.text(it.sku, cols.sku, y);
    const title = pdf.splitTextToSize(it.title || "—", cols.qty - cols.title - 6)[0] as string;
    pdf.text(title, cols.title, y);
    pdf.text(String(qty), cols.qty, y, { align: "right" });
    pdf.text(n2(price), cols.price, y, { align: "right" });
    pdf.text(n2(line), cols.total, y, { align: "right" });
    y += 6;
  }

  y += 4;
  pdf.setDrawColor(150);
  pdf.line(cols.qty - 20, y, PAGE_W - M, y);
  y += 7;
  pdf.setFont("WhNotoGeo", "bold");
  pdf.setFontSize(10);
  pdf.text(`Total qty: ${qtyTotal}`, cols.qty - 20, y);
  pdf.text(`GRAND TOTAL: ${n2(grand)}`, PAGE_W - M, y, { align: "right" });
  y += 6;
  pdf.setFont("WhNotoGeo", "normal");
  pdf.setFontSize(9);
  pdf.text(`Total weight: ${n2(weight)} kg`, PAGE_W - M, y, { align: "right" });

  stamp(pdf, meta);
  return pdf;
}

/** Packing list: no pricing — SKU, title, qty, weight + carton totals. */
export async function buildWholesalePackingList(items: DocItem[], meta: DocMeta): Promise<jsPDF> {
  const font = await loadGeorgianFont();
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  registerFont(pdf, font);

  header(pdf, "PACKING LIST", meta);

  const cols = { sku: M, title: M + 30, qty: 140, weight: PAGE_W - M };

  const tableHead = (y: number) => {
    pdf.setFont("WhNotoGeo", "bold");
    pdf.setFontSize(9);
    pdf.text("SKU", cols.sku, y);
    pdf.text("Description", cols.title, y);
    pdf.text("Qty", cols.qty, y, { align: "right" });
    pdf.text("Weight (kg)", cols.weight, y, { align: "right" });
    pdf.setDrawColor(210);
    pdf.line(M, y + 2, PAGE_W - M, y + 2);
    pdf.setFont("WhNotoGeo", "normal");
    return y + 8;
  };

  let y = tableHead(46);
  let weight = 0;
  let qtyTotal = 0;
  let cartons = 0;

  for (const it of items) {
    y = ensureRoom(pdf, y, (ny) => {
      header(pdf, "PACKING LIST", meta);
      return tableHead(ny + 26);
    });
    const qty = it.quantity ?? 1;
    const w = (it.weight_kg ?? 0) * qty;
    qtyTotal += qty;
    weight += w;
    cartons += it.carton_count ?? 0;

    pdf.setFontSize(9);
    pdf.text(it.sku, cols.sku, y);
    const title = pdf.splitTextToSize(it.title || "—", cols.qty - cols.title - 6)[0] as string;
    pdf.text(title, cols.title, y);
    pdf.text(String(qty), cols.qty, y, { align: "right" });
    pdf.text(n2(w), cols.weight, y, { align: "right" });
    y += 6;
  }

  y += 4;
  pdf.setDrawColor(150);
  pdf.line(cols.qty - 30, y, PAGE_W - M, y);
  y += 7;
  pdf.setFont("WhNotoGeo", "bold");
  pdf.setFontSize(10);
  pdf.text(`Total qty: ${qtyTotal}`, cols.qty - 30, y);
  pdf.text(`Total weight: ${n2(weight)} kg`, PAGE_W - M, y, { align: "right" });
  y += 6;
  pdf.text(`Cartons: ${cartons}`, PAGE_W - M, y, { align: "right" });

  stamp(pdf, meta);
  return pdf;
}
