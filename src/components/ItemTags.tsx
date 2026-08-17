import jsPDF from "jspdf";

/**
 * Item tags — one peel-and-stick sticker per physical unit, printed on
 * the same 76mm x 92mm stock as the courier labels. Content is plain
 * ASCII (bin number + round-slot code), so this renders as real vector
 * PDF text directly — no image rasterization needed, unlike the courier
 * label (which needs Georgian glyphs the PDF core fonts don't support).
 *
 * Sorted bin-ascending within each round, rounds in order — the printed
 * stack itself IS the pick path: work top to bottom, no separate sheet
 * needed.
 */

const TAG_WIDTH_MM = 76;
const TAG_HEIGHT_MM = 92;

export interface ItemTag {
  binLocation: string;
  roundSlotCode: string; // e.g. "R03-05"
  orderNumber?: string | null; // optional small reference line
}

export function downloadItemTagsPdf(tags: ItemTag[], filename = "item-tags.pdf") {
  if (tags.length === 0) return;

  const pdf = new jsPDF({ unit: "mm", format: [TAG_WIDTH_MM, TAG_HEIGHT_MM] });
  const cx = TAG_WIDTH_MM / 2;

  tags.forEach((tag, i) => {
    if (i > 0) pdf.addPage([TAG_WIDTH_MM, TAG_HEIGHT_MM], "portrait");

    // Bin number — big, centered, the thing the picker scans for at the shelf.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(48);
    pdf.text(String(tag.binLocation), cx, 38, { align: "center" });

    // Small label above it for clarity.
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text("BIN", cx, 20, { align: "center" });

    // Divider
    pdf.setLineDashPattern([2, 1], 0);
    pdf.line(6, 48, TAG_WIDTH_MM - 6, 48);

    // Round-slot code — what the table-sorter matches against the parcel's slip.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(32);
    pdf.text(tag.roundSlotCode, cx, 72, { align: "center" });

    if (tag.orderNumber) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(String(tag.orderNumber), cx, 84, { align: "center" });
    }
  });

  pdf.save(filename);
}

/**
 * Builds the ordered tag list for a set of rounds: one tag per physical
 * unit, bin-ascending within each round, rounds in the order given.
 * `roundsData` = for each round, its run_number and its slots joined to
 * order items (each item split into one entry per unit of quantity).
 */
export interface RoundUnit {
  binLocation: string;
  slotNumber: number;
  quantity: number;
  orderNumber?: string | null;
}
export interface RoundInput {
  runNumber: number;
  units: RoundUnit[];
}

function cmpBin(a: string, b: string) {
  const av = (a || "").trim(), bv = (b || "").trim();
  if (av === "" && bv === "") return 0;
  if (av === "") return 1;
  if (bv === "") return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

export function buildTagsForRounds(rounds: RoundInput[]): ItemTag[] {
  const tags: ItemTag[] = [];
  for (const round of rounds) {
    const sorted = [...round.units].sort((a, b) => cmpBin(a.binLocation, b.binLocation));
    for (const unit of sorted) {
      const code = `R${String(round.runNumber).padStart(2, "0")}-${String(unit.slotNumber).padStart(2, "0")}`;
      for (let q = 0; q < unit.quantity; q++) {
        tags.push({ binLocation: unit.binLocation, roundSlotCode: code, orderNumber: unit.orderNumber });
      }
    }
  }
  return tags;
}
