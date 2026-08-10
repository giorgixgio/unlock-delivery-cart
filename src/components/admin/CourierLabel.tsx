import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";

export interface CourierLabelData {
  id: string;
  public_order_number: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  address_line1: string;
  address_line2?: string | null;
  total: number;
  tracking_number?: string | null;
  courier_zone_id?: string | null;
  courier_label_text?: string | null;
  courier_label_date?: string | null;
}

/** 76mm x 92mm at 8px/mm — matches the OnWay thermal sticker. */
export const LABEL_W_PX = 608;
export const LABEL_H_PX = 736;
export const LABEL_W_MM = 76;
export const LABEL_H_MM = 92;

export function useQrDataUrl(value: string | null | undefined) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let alive = true;
    if (!value) {
      setUrl("");
      return;
    }
    QRCode.toDataURL(value, { margin: 0, width: 320, errorCorrectionLevel: "M" })
      .then((d) => alive && setUrl(d))
      .catch(() => alive && setUrl(""));
    return () => {
      alive = false;
    };
  }, [value]);
  return url;
}

/**
 * Pixel-exact reproduction of the OnWay thermal sticker.
 * Rendered off-screen and rasterised with html2canvas, so it deliberately
 * uses inline styles / plain black-on-white (thermal printers are 1-bit).
 */
const CourierLabel = forwardRef<HTMLDivElement, { data: CourierLabelData }>(
  ({ data }, ref) => {
    const ref500 = data.tracking_number || data.public_order_number;
    const qr = useQrDataUrl(ref500);
    const date =
      data.courier_label_date ||
      new Date().toISOString().slice(0, 10);
    const addr = [data.address_line1, data.address_line2]
      .filter(Boolean)
      .join(", ");

    return (
      <div
        ref={ref}
        style={{
          width: LABEL_W_PX,
          height: LABEL_H_PX,
          background: "#ffffff",
          color: "#000000",
          fontFamily: "'Noto Sans Georgian', 'Helvetica Neue', Arial, sans-serif",
          boxSizing: "border-box",
          padding: 16,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header: date + zone */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "3px solid #000",
            paddingBottom: 8,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>{date}</div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>
            {data.courier_zone_id ?? "—"}
          </div>
        </div>

        {/* QR + reference */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "12px 0",
            borderBottom: "2px solid #000",
          }}
        >
          {qr ? (
            <img src={qr} alt="" style={{ width: 170, height: 170 }} />
          ) : (
            <div style={{ width: 170, height: 170, border: "2px dashed #000" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>#</div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 900,
                wordBreak: "break-all",
                lineHeight: 1.1,
              }}
            >
              {ref500}
            </div>
            <div style={{ fontSize: 20, marginTop: 8, fontWeight: 700 }}>
              {data.public_order_number}
            </div>
          </div>
        </div>

        {/* Recipient */}
        <div style={{ padding: "10px 0", borderBottom: "2px solid #000" }}>
          <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.15 }}>
            {data.customer_name}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            {data.customer_phone}
          </div>
        </div>

        {/* Address */}
        <div style={{ padding: "10px 0", flex: 1, borderBottom: "2px solid #000" }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{data.city}</div>
          <div style={{ fontSize: 22, lineHeight: 1.25, marginTop: 4 }}>{addr}</div>
        </div>

        {/* COD */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0",
            borderBottom: "2px solid #000",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>ასაღები თანხა</div>
          <div style={{ fontSize: 40, fontWeight: 900 }}>
            {Number(data.total || 0).toFixed(2)} ₾
          </div>
        </div>

        {/* Bottom label line — exact string captured at export time */}
        <div
          style={{
            paddingTop: 10,
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {data.courier_label_text || "—"}
        </div>
      </div>
    );
  }
);
CourierLabel.displayName = "CourierLabel";

export default CourierLabel;
