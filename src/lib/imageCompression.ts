/**
 * Client-side photo compression for warehouse scans.
 * Downscales so the longest side is <= maxSide (never upscales) and
 * re-encodes as JPEG, which keeps uploads small on slow warehouse phones.
 */
export async function compressImage(
  file: File | Blob,
  maxSide = 1280,
  quality = 0.82,
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob || file;
  } catch {
    // Any decoding failure (exotic format, memory) — fall back to the original.
    return file;
  }
}
