// Pure helpers for splitting a full-day Onway API send into short requests.
export const ONWAY_SEND_CHUNK = 25;

export function chunkIds<T>(ids: T[], size = ONWAY_SEND_CHUNK): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export interface ChunkTotals {
  sent_count: number; review_count: number; fulfilled_count: number; not_fulfilled_count: number;
  attempted: number; failed: number; batch_id: string | null; batch_name: string | null; done: number;
}
export const emptyTotals = (): ChunkTotals => ({
  sent_count: 0, review_count: 0, fulfilled_count: 0, not_fulfilled_count: 0, attempted: 0, failed: 0, batch_id: null, batch_name: null, done: 0,
});

/** Add one chunk response; the first chunk that creates a batch fixes batch_id for the rest of the send. */
export function addChunk(t: ChunkTotals, d: any, chunkSize: number): ChunkTotals {
  return {
    sent_count: t.sent_count + (d?.sent_count || 0),
    review_count: t.review_count + (d?.review_count || 0),
    fulfilled_count: t.fulfilled_count + (d?.fulfilled_count || 0),
    not_fulfilled_count: t.not_fulfilled_count + (d?.not_fulfilled_count || 0),
    attempted: t.attempted + (d?.attempted_count || 0),
    failed: t.failed + (d?.failed_count || 0),
    batch_id: t.batch_id ?? d?.batch_id ?? null,
    batch_name: d?.batch_name ?? t.batch_name,
    done: t.done + chunkSize,
  };
}

/** Body for one chunk request: same batch, dry-run tags, one alert at the end. */
export function chunkBody(ids: string[], tags: Record<string, string>, t: ChunkTotals, final: boolean) {
  const chunkTags: Record<string, string> = {};
  for (const id of ids) if (tags[id]) chunkTags[id] = tags[id];
  return {
    dry_run: false, order_ids: ids, tags: chunkTags,
    ...(t.batch_id ? { batch_id: t.batch_id } : {}),
    chunk: { final, prior: { attempted: t.attempted, sent: t.sent_count, failed: t.failed } },
  };
}
