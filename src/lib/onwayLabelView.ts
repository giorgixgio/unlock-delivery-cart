export interface OnwayLabelDataRow {
  order_id: string;
  tracking: string;
  box_index: number;
  box_count: number;
  payload: Record<string, unknown> | null;
}

export interface BaseLabelOrderInput {
  id: string;
  tracking_number: string | null;
  courier_zone_id: number | string | null;
  courier_label_text: string | null;
  courier_label_date: string | null;
  customer_phone: string | null;
  address: string;
  city: string;
}

export interface CourierLabelRenderItem {
  id: string;
  zone: string;
  dateText: string;
  sender: string;
  recipientText: string;
  qrValue: string;
  qtyText: string;
  weightText: string;
  trackingLine: string;
  tagLine: string;
  boxIndex: number;
  boxCount: number;
  hasOnwayData: boolean;
}

function payloadStr(payload: Record<string, unknown> | null | undefined, key: string): string {
  if (!payload || typeof payload !== "object") return "";
  const direct = payload[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (typeof direct === "number" && Number.isFinite(direct)) return String(direct);
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(payload)) {
    if (k.toLowerCase() === lower) {
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
  }
  return "";
}

function payloadNum(payload: Record<string, unknown> | null | undefined, key: string): number | null {
  const s = payloadStr(payload, key);
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Formats ISO date or YYYY-MM-DD as DD/MM/YYYY without timezone day-shift. */
export function formatLabelDate(iso: string | null | undefined): string {
  if (iso) {
    const dateOnly = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}/${d.getFullYear()}`;
    }
  }
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${now.getFullYear()}`;
}

/** "{phone}, {address}, {city}, {phone}" — matches OnWay's exact sticker recipient line. */
export function buildRecipientText(phone: string | null | undefined, address: string | null | undefined, city: string | null | undefined): string {
  const p = (phone || "").trim();
  const a = (address || "").trim();
  const c = (city || "").trim();
  return [p, a, c, p].filter(Boolean).join(", ");
}

/** "{line_id} #{tracking}" when OnWay's Tbilisi district line_id is present; otherwise "#{tracking}". */
export function formatTrackingLine(tracking: string | null | undefined, lineId: string | null | undefined): string {
  const tr = (tracking || "").trim() || "—";
  const lid = (lineId || "").trim();
  return lid ? `${lid} #${tr}` : `#${tr}`;
}

export function formatQtyLine(quantity: number, boxIndex: number, boxCount: number): string {
  const qty = Number.isFinite(quantity) && quantity >= 1 ? Math.round(quantity) : 1;
  if (boxCount > 1) return `${qty} (ყუთი ${boxIndex}/${boxCount})`;
  return String(qty);
}

export function formatWeight(weight: number | null | undefined): string {
  const w = weight != null && Number.isFinite(weight) && weight > 0 ? weight : 1;
  return w.toFixed(1);
}

/**
 * Expands orders into renderable label items in the exact incoming order.
 * Multi-box orders with N rows in `onway_label_data` produce N labels ordered by `box_index`.
 */
export function expandOrdersToLabels(
  orders: BaseLabelOrderInput[],
  labelRowsByOrderId: Map<string, OnwayLabelDataRow[]>
): CourierLabelRenderItem[] {
  const out: CourierLabelRenderItem[] = [];

  for (const order of orders) {
    const captured = (labelRowsByOrderId.get(order.id) || [])
      .slice()
      .sort((a, b) => a.box_index - b.box_index);

    const fallbackZone =
      order.courier_zone_id != null && String(order.courier_zone_id).trim() !== ""
        ? String(order.courier_zone_id).trim()
        : "?";
    const dateText = formatLabelDate(order.courier_label_date);
    const recipientText = buildRecipientText(order.customer_phone, order.address, order.city);
    const tagLine = (order.courier_label_text || "").trim();

    if (captured.length === 0) {
      const tracking = (order.tracking_number || "").trim();
      out.push({
        id: order.id,
        zone: fallbackZone,
        dateText,
        sender: "TrendMart",
        recipientText,
        qrValue: tracking,
        qtyText: formatQtyLine(1, 1, 1),
        weightText: formatWeight(1),
        trackingLine: formatTrackingLine(tracking, null),
        tagLine,
        boxIndex: 1,
        boxCount: 1,
        hasOnwayData: false,
      });
      continue;
    }

    for (const row of captured) {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : null;
      const zone = payloadStr(payload, "to_branch_id") || fallbackZone;
      const lineId = payloadStr(payload, "line_id") || null;
      const tracking = (row.tracking || order.tracking_number || "").trim();
      const boxCount = Math.max(1, row.box_count || captured.length);
      const boxIndex = Math.max(1, row.box_index || 1);
      const qty = payloadNum(payload, "quantity") ?? 1;
      const weight = payloadNum(payload, "weight") ?? 1;

      out.push({
        id: boxCount > 1 ? `${order.id}-box-${boxIndex}` : order.id,
        zone,
        dateText,
        sender: "TrendMart",
        recipientText,
        qrValue: tracking,
        qtyText: formatQtyLine(qty, boxIndex, boxCount),
        weightText: formatWeight(weight),
        trackingLine: formatTrackingLine(tracking, lineId),
        tagLine,
        boxIndex,
        boxCount,
        hasOnwayData: true,
      });
    }
  }

  return out;
}