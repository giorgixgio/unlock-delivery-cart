import { supabase } from "@/integrations/supabase/client";

/**
 * Warehouse scan photos live in the private `product-scans` bucket and were
 * stored as 7-day signed URLs — those expire, so old photos stop loading.
 * Re-sign them on read using the object path embedded in the saved URL.
 */
const BUCKET = "product-scans";

export const scanPathFromUrl = (url: string): string | null => {
  const m = url.match(/\/product-scans\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
};

/** Returns a map of original url -> freshly signed url (falls back to original). */
export async function resignScanUrls(urls: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(urls.filter((u): u is string => !!u)));
  const pathByUrl = new Map<string, string>();
  for (const u of unique) {
    const p = scanPathFromUrl(u);
    if (p) pathByUrl.set(u, p);
  }
  if (pathByUrl.size === 0) return {};

  const paths = Array.from(new Set(pathByUrl.values()));
  const out: Record<string, string> = {};

  // Chunk to keep requests small on warehouse connections.
  const CHUNK = 100;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(slice, 60 * 60 * 6);
    if (error || !data) continue;
    const signedByPath: Record<string, string> = {};
    for (const row of data) {
      if (row.signedUrl && row.path) signedByPath[row.path] = row.signedUrl;
    }
    for (const [url, path] of pathByUrl) {
      if (signedByPath[path]) out[url] = signedByPath[path];
    }
  }
  return out;
}
