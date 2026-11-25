import { useEffect, useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import {
  expandOrdersToLabels,
  type BaseLabelOrderInput,
  type CourierLabelRenderItem,
} from "@/lib/onwayLabelView";

/**
 * Courier shipping label — reproduces the OnWay thermal sticker layout,
 * output as a real PDF (one page per label, exactly 76mm x 92mm).
 *
 * Drawn as native vector PDF text with an embedded Georgian font, so
 * generation stays fast for large batches (no html2canvas rasterisation,
 * no giant base64 image strings).
 */

export const LABEL_W_MM = 76;
export const LABEL_H_MM = 92;
const LABEL_WIDTH_MM = LABEL_W_MM;
const LABEL_HEIGHT_MM = LABEL_H_MM;
const ONWAY_PURPLE = "#4B3C9E";
const ONWAY_PURPLE_RGB: [number, number, number] = [75, 60, 158];

const FONT_REGULAR_URL =
  "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-georgian/NotoSansGeorgian_400Regular.ttf";
const FONT_BOLD_URL =
  "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-georgian/NotoSansGeorgian_700Bold.ttf";

let fontCache: { regular: string; bold: string } | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchFont(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${url}`);
  return toBase64(await res.arrayBuffer());
}

/** Fetches + caches the Georgian font once per session. */
export async function loadGeorgianFont() {
  if (!fontCache) {
    const [regular, bold] = await Promise.all([
      fetchFont(FONT_REGULAR_URL),
      fetchFont(FONT_BOLD_URL),
    ]);
    fontCache = { regular, bold };
  }
  return fontCache;
}

function registerFont(pdf: jsPDF, font: { regular: string; bold: string }) {
  pdf.addFileToVFS("NotoSansGeorgian-Regular.ttf", font.regular);
  pdf.addFont("NotoSansGeorgian-Regular.ttf", "NotoGeo", "normal");
  pdf.addFileToVFS("NotoSansGeorgian-Bold.ttf", font.bold);
  pdf.addFont("NotoSansGeorgian-Bold.ttf", "NotoGeo", "bold");
}


export type CourierLabelOrder = BaseLabelOrderInput;

function toRenderItem(input: CourierLabelOrder | CourierLabelRenderItem): CourierLabelRenderItem {
  if ("recipientText" in input && "trackingLine" in input) return input;
  return expandOrdersToLabels([input], new Map())[0];
}

const DASHED_RULE_STYLE: React.CSSProperties = {
  borderTop: "1px dashed #000",
  margin: "4px 0",
};

function LabelMarkup({ item, qrDataUrl }: { item: CourierLabelRenderItem; qrDataUrl: string }) {
  return (
    <div
      id={`courier-label-${item.id}`}
      style={{
        width: `${LABEL_WIDTH_MM}mm`,
        height: `${LABEL_HEIGHT_MM}mm`,
        padding: "3mm",
        boxSizing: "border-box",
        fontFamily: "'Noto Sans Georgian', sans-serif",
        fontSize: "11.5px",
        fontWeight: 400,
        lineHeight: 1.35,
        background: "#fff",
        color: "#000",
      }}
    >
      {/* 1. Header: zone - date | ONWAY wordmark */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "13px", fontWeight: 400 }}>
          {item.zone} - {item.dateText}
        </span>
        <span
          style={{
            fontSize: "15px",
            fontWeight: 800,
            fontStyle: "italic",
            letterSpacing: "0.06em",
            color: ONWAY_PURPLE,
          }}
        >
          ONWAY
        </span>
      </div>
      {/* 2. Dashed separator */}
      <div style={DASHED_RULE_STYLE} />
      {/* 3. Sender */}
      <div>
        <span style={{ fontWeight: 700 }}>გამგზავნი: </span>
        <span>{item.sender}</span>
      </div>
      {/* 4. Dashed separator */}
      <div style={DASHED_RULE_STYLE} />
      {/* 5. Recipient (inline bold label + regular wrapped text, same size) */}
      <div style={{ wordBreak: "break-word" }}>
        <span style={{ fontWeight: 700 }}>მიმღები: </span>
        <span>{item.recipientText}</span>
      </div>
      {/* 6. Dashed separator */}
      <div style={DASHED_RULE_STYLE} />
      {/* 7. QR (22mm) + 3 stacked rows each followed by dashed separator */}
      <div style={{ display: "flex", gap: "3mm", alignItems: "flex-start", padding: "1px 0" }}>
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt=""
            style={{ width: "22mm", height: "22mm", display: "block", flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: "22mm", height: "22mm", border: "1px dashed #000", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ paddingBottom: "3px" }}>რაოდ.: {item.qtyText}</div>
          <div style={{ borderTop: "1px dashed #000", marginBottom: "3px" }} />
          <div style={{ paddingBottom: "3px" }}>წონა: {item.weightText}</div>
          <div style={{ borderTop: "1px dashed #000", marginBottom: "3px" }} />
          <div style={{ paddingBottom: "3px", wordBreak: "break-word" }}>{item.trackingLine}</div>
          <div style={{ borderTop: "1px dashed #000" }} />
        </div>
      </div>
      {/* 8. Dashed separator full width */}
      <div style={DASHED_RULE_STYLE} />
      {/* 9. Tag line in BOLD, slightly larger */}
      {item.tagLine && (
        <div style={{ fontWeight: 700, fontSize: "13.5px", lineHeight: 1.3, paddingTop: "1px" }}>
          {item.tagLine}
        </div>
      )}
    </div>
  );
}

/** Splits text so the first line fits after an inline bold prefix, and subsequent lines use full width. */
function splitInlineAfterPrefix(pdf: jsPDF, text: string, firstLineMaxW: number, fullLineMaxW: number): string[] {
  const clean = text.trim();
  if (!clean) return [""];
  if (pdf.getTextWidth(clean) <= firstLineMaxW) return [clean];

  const words = clean.split(/\s+/);
  let firstLine = "";
  let idx = 0;
  while (idx < words.length) {
    const candidate = firstLine ? `${firstLine} ${words[idx]}` : words[idx];
    if (pdf.getTextWidth(candidate) <= firstLineMaxW) {
      firstLine = candidate;
      idx += 1;
    } else {
      break;
    }
  }
  if (!firstLine) {
    // Single long token that exceeds firstLineMaxW — wrap on next line.
    return ["", ...pdf.splitTextToSize(clean, fullLineMaxW)];
  }
  const rest = words.slice(idx).join(" ");
  if (!rest) return [firstLine];
  return [firstLine, ...pdf.splitTextToSize(rest, fullLineMaxW)];
}

/** Draws one label onto the current page of `pdf`. */
export function drawLabel(pdf: jsPDF, input: CourierLabelOrder | CourierLabelRenderItem, qrDataUrl: string) {
  const item = toRenderItem(input);
  const M = 3; // padding, mm
  const W = LABEL_WIDTH_MM;
  const right = W - M;
  const contentW = right - M;
  let y = M + 4;

  const drawDashed = (x1: number, x2: number, yy: number) => {
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineDashPattern([0.8, 0.8], 0);
    pdf.setLineWidth(0.22);
    pdf.line(x1, yy, x2, yy);
    pdf.setLineDashPattern([], 0);
  };

  const fullRule = () => {
    drawDashed(M, right, y);
    y += 3.6;
  };

  // 1. Header: "{to_branch_id} - {DD/MM/YYYY}" regular ~13px | ONWAY purple wordmark
  pdf.setTextColor(0, 0, 0);
  pdf.setFont("NotoGeo", "normal");
  pdf.setFontSize(9.8);
  pdf.text(`${item.zone} - ${item.dateText}`, M, y);

  pdf.setTextColor(...ONWAY_PURPLE_RGB);
  pdf.setFont("NotoGeo", "bold");
  pdf.setFontSize(11.5);
  pdf.text("ONWAY", right, y, { align: "right" });
  pdf.setTextColor(0, 0, 0);
  y += 2.2;
  // 2. Dashed separator
  fullRule();

  // 3. "გამგზავნი: " bold + "TrendMart" regular
  pdf.setFontSize(8.8);
  pdf.setFont("NotoGeo", "bold");
  pdf.text("გამგზავნი:", M, y);
  const senderW = pdf.getTextWidth("გამგზავნი: ");
  pdf.setFont("NotoGeo", "normal");
  pdf.text(item.sender, M + senderW, y);
  y += 2.2;
  // 4. Dashed separator
  fullRule();

  // 5. "მიმღები: " bold + "{phone}, {address}, {city}, {phone}" regular wrapping inline
  pdf.setFontSize(8.8);
  pdf.setFont("NotoGeo", "bold");
  pdf.text("მიმღები:", M, y);
  const recLabelW = pdf.getTextWidth("მიმღები: ");
  pdf.setFont("NotoGeo", "normal");
  const recLines = splitInlineAfterPrefix(pdf, item.recipientText, Math.max(10, contentW - recLabelW), contentW);
  const lineH = 4.0;
  if (recLines[0]) pdf.text(recLines[0], M + recLabelW, y);
  for (let i = 1; i < recLines.length; i++) {
    y += lineH;
    pdf.text(recLines[i], M, y);
  }
  y += 2.4;
  // 6. Dashed separator
  fullRule();

  // 7. Two columns: 22mm QR (tracking only) + 3 stacked rows each with dashed separator
  const qrSize = 22;
  const qrTop = y - 1.4;
  if (qrDataUrl) {
    pdf.addImage(qrDataUrl, "PNG", M, qrTop, qrSize, qrSize);
  }

  const metaX = M + qrSize + 3;
  const metaW = right - metaX;
  let my = qrTop + 4;
  pdf.setFont("NotoGeo", "normal");
  pdf.setFontSize(8.8);

  const qtyLines = pdf.splitTextToSize(`რაოდ.: ${item.qtyText}`, metaW);
  for (const line of qtyLines) {
    pdf.text(line, metaX, my);
    my += 3.8;
  }
  drawDashed(metaX, right, my - 1.8);
  my += 2.2;

  pdf.text(`წონა: ${item.weightText}`, metaX, my);
  my += 2.0;
  drawDashed(metaX, right, my);
  my += 4.0;

  const trackingLines = pdf.splitTextToSize(item.trackingLine, metaW);
  for (const line of trackingLines) {
    pdf.text(line, metaX, my);
    my += 3.8;
  }
  drawDashed(metaX, right, my - 1.8);

  // 8. Full-width dashed separator
  y = Math.max(qrTop + qrSize, my) + 2.2;
  fullRule();

  // 9. Tag line in BOLD, slightly larger
  if (item.tagLine) {
    pdf.setFont("NotoGeo", "bold");
    pdf.setFontSize(10.5);
    const footer = pdf.splitTextToSize(item.tagLine, contentW);
    for (const line of footer) {
      pdf.text(line, M, y);
      y += 4.5;
    }
  }
}

/**
 * Generates the PDF and triggers a download. Draws native vector text with an
 * embedded Georgian font — no DOM rendering or rasterisation, so a 500-label
 * batch stays fast and small.
 */
export async function downloadCourierLabelsPdf(
  orders: Array<CourierLabelOrder | CourierLabelRenderItem>,
  filename = "courier-labels.pdf"
) {
  if (orders.length === 0) return;

  const font = await loadGeorgianFont();

  const pdf = new jsPDF({ unit: "mm", format: [LABEL_WIDTH_MM, LABEL_HEIGHT_MM], compress: true });
  registerFont(pdf, font);

  for (let i = 0; i < orders.length; i++) {
    const item = toRenderItem(orders[i]);
    const qr = item.qrValue
      ? await QRCode.toDataURL(item.qrValue, { margin: 0, width: 260, errorCorrectionLevel: "M" })
      : "";
    if (i > 0) pdf.addPage([LABEL_WIDTH_MM, LABEL_HEIGHT_MM], "portrait");
    drawLabel(pdf, item, qr);
  }

  pdf.save(filename);
}

/** On-screen 1:1 preview of one 76x92mm label. */
export function CourierLabelPreview({ order }: { order: CourierLabelOrder | CourierLabelRenderItem }) {
  const item = toRenderItem(order);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    if (!item.qrValue) {
      setQr("");
      return;
    }
    QRCode.toDataURL(item.qrValue, { margin: 0, width: 260, errorCorrectionLevel: "M" })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [item.qrValue]);

  return (
    <div className="inline-block border border-border bg-white shadow-sm">
      <LabelMarkup item={item} qrDataUrl={qr} />
    </div>
  );
}
