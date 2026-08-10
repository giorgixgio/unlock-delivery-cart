import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { LABEL_W_MM, LABEL_H_MM } from "@/components/admin/CourierLabel";

/**
 * Rasterises each label node and writes one 76x92mm page per label.
 * Returns the jsPDF doc so the caller can save() or open a print window.
 */
export async function buildLabelPdf(nodes: HTMLElement[]): Promise<jsPDF> {
  const doc = new jsPDF({
    unit: "mm",
    format: [LABEL_W_MM, LABEL_H_MM],
    orientation: "portrait",
    compress: true,
  });

  for (let i = 0; i < nodes.length; i++) {
    const canvas = await html2canvas(nodes[i], {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    });
    const img = canvas.toDataURL("image/png");
    if (i > 0) doc.addPage([LABEL_W_MM, LABEL_H_MM], "portrait");
    doc.addImage(img, "PNG", 0, 0, LABEL_W_MM, LABEL_H_MM);
  }

  return doc;
}

export async function downloadLabelPdf(nodes: HTMLElement[], fileName: string) {
  const doc = await buildLabelPdf(nodes);
  doc.save(fileName);
}

export async function printLabelPdf(nodes: HTMLElement[]) {
  const doc = await buildLabelPdf(nodes);
  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}
