import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createWebhookHandler } from './handler.ts';
import { parseOnwayEvent } from './process.ts';
import { actionForReason, classifyComment } from './classify.ts';
import { sendTelegramMessage } from '../_shared/telegram.ts';

// Status actions only come from the admin-mapped onway_status_map; unmapped statuses do nothing.
async function processEvent(db: any, logId: string, body: unknown) {
  const ev = parseOnwayEvent(body);
  if (!ev) { await db.from('onway_webhook_log').update({ match_status: 'unparsed', processed_at: new Date().toISOString() }).eq('id', logId); return; }
  const now = new Date().toISOString();

  // Record status in the map (new ones default to action 'none').
  const { data: known } = await db.from('onway_status_map').select('*').eq('status_id', ev.statusId).maybeSingle();
  if (known) await db.from('onway_status_map').update({ status_name: known.status_name || ev.statusName, last_seen_at: now, seen_count: (known.seen_count || 0) + 1 }).eq('status_id', ev.statusId);
  else await db.from('onway_status_map').insert({ status_id: ev.statusId, status_name: ev.statusName, action: 'none', first_seen_at: now, last_seen_at: now, seen_count: 1 });
  const action: string = known?.action || 'none';

  // Match ONLY by the tracking number stored by onway-create-shipments.
  const { data: order } = await db.from('orders').select('id, public_order_number, onway_planned_date, status').eq('onway_tracking', ev.tracking).maybeSingle();
  await db.from('onway_webhook_log').update({ match_status: order ? 'matched' : 'unmatched', order_id: order?.id ?? null, processed_at: now }).eq('id', logId);

  // AI reason for problem statuses, and for any commented status not mapped yet.
  const wantsAi = !!ev.comment && (action === 'delivery_failed' || action === 'pickup_problem' || !known || known.action === 'none');
  const ai = wantsAi ? await classifyComment(db, ev.comment!, ev.statusName) : null;

  const { data: inserted } = await db.from('onway_status_events').insert({
    ai_reason: ai?.reason ?? null, ai_confidence: ai?.confidence ?? null, ai_summary: ai?.summary ?? null,
    order_id: order?.id ?? null, tracking: ev.tracking, status_id: ev.statusId, status_name: ev.statusName, reason: ev.reason,
    comment: ev.comment, image: ev.image, planned_date: ev.plannedDate, event_time: ev.eventTime, dedupe_key: ev.dedupeKey,
  }).select('id').maybeSingle();
  if (!order || !inserted) return; // unmatched or a re-sent duplicate: nothing else

  const patch: Record<string, unknown> = { onway_last_status: ev.statusName, onway_last_status_at: ev.eventTime || now };
  if (ev.plannedDate && ev.plannedDate !== order.onway_planned_date) patch.onway_planned_date = ev.plannedDate;
  if (action === 'delivery_failed' || action === 'pickup_problem') Object.assign(patch, {
    onway_problem_comment: ev.comment || ev.reason, onway_problem_image: ev.image, onway_problem_at: ev.eventTime || now, onway_problem_resolved_at: null,
    onway_problem_reason: ai?.reason ?? (ev.comment ? 'other' : null), onway_problem_summary: ai?.summary ?? null,
  });
  await db.from('orders').update(patch).eq('id', order.id);

  if (action === 'out_for_delivery') await db.rpc('sms_enqueue', { p_order_id: order.id, p_type: 'out_for_delivery', p_max_seq: 1, p_send_after: now });
  if (action === 'delivery_failed') {
    // No comment -> treat as unreachable (previous behaviour); otherwise act on the AI reason.
    const sms = ev.comment ? actionForReason(ai?.reason ?? 'other').sms : 'delivery_failed';
    if (sms) await db.rpc('sms_enqueue', { p_order_id: order.id, p_type: sms, p_max_seq: 2, p_send_after: now });
  }
  if (action === 'delivery_failed' || action === 'pickup_problem') {
    const title = action === 'pickup_problem' ? '🚚 Onway — აღების პრობლემა' : '⚠️ Onway — ვერ ჩაბარდა';
    const r = await sendTelegramMessage(`${title}\nშეკვეთა #${order.public_order_number}\nთრექინგი: ${ev.tracking}\nსტატუსი: ${ev.statusName}${ai ? `\nმიზეზი: ${ai.reason}${ai.summary ? ` — ${ai.summary}` : ''}` : ''}${ev.comment ? `\nკურიერი: ${ev.comment}` : ''}${ev.image ? `\n${ev.image}` : ''}`);
    if (!r.ok) console.error('onway-webhook telegram failed', r.status);
  }
}

Deno.serve(createWebhookHandler({
  token: () => Deno.env.get('ONWAY_WEBHOOK_TOKEN'),
  corsHeaders,
  background: (task) => EdgeRuntime.waitUntil(task),
  save: async (row) => {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Logging unavailable');
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.from('onway_webhook_log').insert(row).select('id')
      .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error) throw new Error('Logging failed');
    try { if (data?.id) await processEvent(client, data.id, row.body_json); }
    catch { console.error('onway-webhook: processing failed'); }
  },
}));
