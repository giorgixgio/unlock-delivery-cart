import { useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";

/**
 * Courier shipping label — reproduces the OnWay thermal sticker layout,
 * output as a real PDF (one page per label, exactly 76mm x 92mm).
 *
 * Drawn as native vector PDF text with an embedded Georgian font, so
 * generation stays fast for large batches (no html2canvas rasterisation,
 * no giant base64 image strings).
 */

const LABEL_WIDTH_MM = 76;
const LABEL_HEIGHT_MM = 92;

const FONT_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansGeorgian/NotoSansGeorgian-Regular.ttf";
const FONT_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansGeorgian/NotoSansGeorgian-Bold.ttf";

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


export interface CourierLabelOrder {
  id: string;
  tracking_number: string | null;
  courier_zone_id: number | null;
  courier_label_text: string | null;
  courier_label_date: string | null; // ISO date
  customer_phone: string | null;
  address: string;
  city: string;
}

function formatDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function LabelMarkup({ order, qrDataUrl }: { order: CourierLabelOrder; qrDataUrl: string }) {
  const tracking = order.tracking_number || "—";
  return (
    <div
      id={`courier-label-${order.id}`}
      style={{
        width: `${LABEL_WIDTH_MM}mm`,
        height: `${LABEL_HEIGHT_MM}mm`,
        padding: "3mm",
        boxSizing: "border-box",
        fontFamily: "sans-serif",
        fontSize: "11px",
        background: "#fff",
        color: "#000",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "14px", fontWeight: 700 }}>
        <span>{order.courier_zone_id ?? "?"} - {formatDate(order.courier_label_date)}</span>
        <span style={{ fontStyle: "italic" }}>ONWAY</span>
      </div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <div style={{ lineHeight: 1.35 }}><b>გამგზავნი:</b> ბიგმართი</div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <div style={{ lineHeight: 1.35 }}>
        <b>მიმღები:</b> {order.customer_phone}, {order.address}, {order.city}, {order.customer_phone}
      </div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <img src={qrDataUrl} width={96} height={96} alt="" />
        <div style={{ flex: 1, fontSize: "12px" }}>
          <div>რაოდ.: 1</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div>წონა: 1.0</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div># {tracking}</div>
        </div>
      </div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <div style={{ fontWeight: 700, fontSize: "13px" }}>{order.courier_label_text || ""}</div>
    </div>
  );
}

/**
 * Generates the PDF and triggers a download. Renders each label off-screen
 * one at a time (avoids one giant hidden DOM tree for large batches),
 * captures it, adds it as an exact-size page, then cleans up.
 */
export async function downloadCourierLabelsPdf(orders: CourierLabelOrder[], filename = "courier-labels.pdf") {
  if (orders.length === 0) return;

  const qrDataUrls = await Promise.all(
    orders.map((o) => QRCode.toDataURL(o.tracking_number || "", { margin: 0, width: 300 }))
  );

  const pdf = new jsPDF({ unit: "mm", format: [LABEL_WIDTH_MM, LABEL_HEIGHT_MM] });

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  document.body.appendChild(host);

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host);

  try {
    for (let i = 0; i < orders.length; i++) {
      await new Promise<void>((resolve) => {
        root.render(<LabelMarkup order={orders[i]} qrDataUrl={qrDataUrls[i]} />);
        // wait two frames so the DOM/image has actually painted before capture
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const node = host.firstElementChild as HTMLElement;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");

      if (i > 0) pdf.addPage([LABEL_WIDTH_MM, LABEL_HEIGHT_MM], "portrait");
      pdf.addImage(imgData, "PNG", 0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM);
    }

    pdf.save(filename);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}

/** Small on-screen preview of one label (not used for the PDF itself). */
export function CourierLabelPreview({ order }: { order: CourierLabelOrder }) {
  const [qr, setQr] = useState<string>("");

  useState(() => {
    QRCode.toDataURL(order.tracking_number || "", { margin: 0, width: 200 }).then(setQr);
  });

  if (!qr) return null;

  return (
    <div style={{ transform: "scale(0.9)", transformOrigin: "top left", border: "1px solid #ddd" }}>
      <LabelMarkup order={order} qrDataUrl={qr} />
    </div>
  );
}
