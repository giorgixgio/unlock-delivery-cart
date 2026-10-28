import { proxyFetch } from '../_shared/proxyFetch.ts';

Deno.serve(async () => {
  const out: Record<string, unknown> = {};
  try {
    const r = await proxyFetch('https://ip.quotaguard.com');
    const t = (await r.text()).trim();
    out.proxy_status = r.status;
    out.proxy_ip = t.match(/\d+\.\d+\.\d+\.\d+/)?.[0] ?? null;
  } catch (e) { out.proxy_error = String((e as Error).message).replace(/\/\/[^@]*@/g, '//***@'); }
  try {
    const base = Deno.env.get('SUPABASE_URL');
    const tok = Deno.env.get('ONWAY_WEBHOOK_TOKEN') ?? '';
    const r = await fetch(`${base}/functions/v1/onway-webhook?token=${encodeURIComponent(tok)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"test":true}',
    });
    out.webhook_status = r.status;
  } catch (e) { out.webhook_error = String((e as Error).message); }
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
});
