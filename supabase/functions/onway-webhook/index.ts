import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createWebhookHandler } from './handler.ts';

Deno.serve(createWebhookHandler({
  token: () => Deno.env.get('ONWAY_WEBHOOK_TOKEN'),
  corsHeaders,
  background: (task) => EdgeRuntime.waitUntil(task),
  save: async (row) => {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Logging unavailable');
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.from('onway_webhook_log').insert(row)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('Logging failed');
  },
}));