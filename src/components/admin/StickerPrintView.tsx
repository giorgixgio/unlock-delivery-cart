export interface StickerOrder {
  orderId: string;
  publicOrderNumber: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  tracking: string;
  items: { sku: string; quantity: number; title: string }[];
}

function buildStickerHtml(s: { seq: number; order: StickerOrder; sku: string }, totalPages: number, today: string): string {
  const qrData = [
    "TRACK:" + s.order.tracking,
    "SKU:" + s.sku,
    "ORD:" + s.order.publicOrderNumber,
    "ADDR:" + s.order.address + ", " + s.order.city,
    "NAME:" + s.order.customerName,
    "SENDER:BIGMART",
    "QTY:1",
  ].join("|");

  return '<div class="sticker" id="sticker-' + s.seq + '">' +
    '<div class="top-line"><span>#' + s.seq + ' / ' + totalPages + '</span><span>' + today + '</span></div>' +
    '<div class="sender">გამგზ: BIGMART</div>' +
    '<div class="recipient">' +
      '<div class="name">' + escapeHtml(s.order.customerName) + '</div>' +
      '<div>' + escapeHtml(s.order.address) + '</div>' +
      '<div>' + escapeHtml(s.order.city) + '</div>' +
      '<div>' + escapeHtml(s.order.phone) + '</div>' +
    '</div>' +
    '<div class="middle">' +
      '<div class="qr-code" data-qr="' + encodeURIComponent(qrData) + '"></div>' +
      '<div class="tracking-info">' +
        '<div class="tracking-label">თრექინგი</div>' +
        '<div class="tracking-num">' + escapeHtml(s.order.tracking) + '</div>' +
        '<div class="qty-line">რაოდენობა: 1</div>' +
      '</div>' +
    '</div>' +
    '<div class="sku-bottom">SKU ' + escapeHtml(s.sku) + '</div>' +
  '</div>';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function openStickerPrintWindow(orders: StickerOrder[]) {
  const stickers: { seq: number; order: StickerOrder; sku: string }[] = [];
  let seq = 1;
  for (const order of orders) {
    for (const item of order.items) {
      stickers.push({ seq: seq++, order, sku: item.sku });
    }
  }

  const totalPages = stickers.length;
  const today = new Date().toLocaleDateString("ka-GE");

  const stickerBodies = stickers.map(s => buildStickerHtml(s, totalPages, today)).join("\n");

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<title>Stickers - ' + today + '</title>' +
    '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></' + 'script>' +
    '<style>' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }' +
    '@page { size: 4in 3in; margin: 0; }' +
    'body { font-family: "Segoe UI", Arial, sans-serif; }' +
    '.sticker { width: 4in; height: 3in; padding: 0.15in; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #ccc; position: relative; overflow: hidden; }' +
    '.sticker:last-child { page-break-after: auto; }' +
    '.top-line { font-size: 8pt; color: #666; display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 4px; }' +
    '.sender { font-size: 9pt; font-weight: bold; color: #333; margin-bottom: 2px; }' +
    '.recipient { font-size: 9pt; line-height: 1.3; flex: 1; }' +
    '.recipient .name { font-weight: bold; font-size: 10pt; }' +
    '.middle { display: flex; align-items: center; gap: 8px; margin: 4px 0; }' +
    '.qr-code { width: 1.1in; height: 1.1in; flex-shrink: 0; }' +
    '.qr-code canvas, .qr-code img { width: 100%; height: 100%; }' +
    '.tracking-info { flex: 1; display: flex; flex-direction: column; justify-content: center; }' +
    '.tracking-label { font-size: 7pt; color: #999; }' +
    '.tracking-num { font-size: 11pt; font-weight: bold; font-family: monospace; word-break: break-all; }' +
    '.qty-line { font-size: 8pt; color: #555; margin-top: 2px; }' +
    '.sku-bottom { text-align: center; font-size: 22pt; font-weight: 900; border-top: 2px solid #000; padding-top: 4px; letter-spacing: 2px; }' +
    '@media print { .sticker { border: none; } }' +
    '</style></head><body>' +
    stickerBodies +
    '<script>' +
    'document.querySelectorAll(".qr-code[data-qr]").forEach(function(el){' +
    'try{var text=decodeURIComponent(el.getAttribute("data-qr"));' +
    'var qr=qrcode(0,"L");qr.addData(text);qr.make();' +
    'el.innerHTML=qr.createImgTag(4,0);}catch(e){el.textContent="QR err";}' +
    '});' +
    '</' + 'script></body></html>';

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
