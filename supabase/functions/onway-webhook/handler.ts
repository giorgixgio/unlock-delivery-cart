export interface WebhookLog {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string[]>;
  body_raw: string | null;
  body_json: unknown;
  source_ip: string | null;
}

interface Dependencies {
  token: () => string | undefined;
  save: (row: WebhookLog) => Promise<void>;
  background: (task: Promise<void>) => void;
  corsHeaders: Record<string, string>;
}

const sensitive = /token|authorization|cookie|api[-_]?key|secret/i;

// Never retain the callback credential, even if echoed into the payload.
function redact(value: string, token: string): string {
  return value.split(token).join('[REDACTED]');
}

export function createWebhookHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const respond = (status: number, message: string) => new Response(message, {
      status,
      headers: { ...deps.corsHeaders, 'Content-Type': 'application/json' },
    });
    if (req.method === 'OPTIONS') return respond(200, '{}');
    const url = new URL(req.url);
    const token = deps.token();
    const supplied = url.searchParams.getAll('token');
    if (!token || supplied.length !== 1 || supplied[0] !== token) {
      return respond(401, '{"error":"Unauthorized"}');
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      return respond(405, '{"error":"Method not allowed"}');
    }

    const capture = async () => {
      try {
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => {
          headers[key] = sensitive.test(key) ? '[REDACTED]' : redact(value, token);
        });
        const query: Record<string, string[]> = {};
        url.searchParams.forEach((value, key) => {
          (query[key] ??= []).push(sensitive.test(key) ? '[REDACTED]' : redact(value, token));
        });
        let bodyRaw: string | null = null;
        try { bodyRaw = redact(await req.text(), token); } catch { /* Still log metadata. */ }
        let bodyJson: unknown = null;
        if (bodyRaw) {
          try { bodyJson = JSON.parse(bodyRaw); } catch { /* Unknown payload formats are expected. */ }
        }
        const sourceIp = req.headers.get('cf-connecting-ip')
          || req.headers.get('x-real-ip')
          || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || null;
        await deps.save({ method: req.method, headers, query, body_raw: bodyRaw,
          body_json: bodyJson, source_ip: sourceIp ? redact(sourceIp, token) : null });
      } catch {
        // Do not print request data, database errors or secrets.
        console.error('onway-webhook: capture failed');
      }
    };
    try { deps.background(capture()); } catch { console.error('onway-webhook: background scheduling failed'); }
    return respond(200, '{"ok":true}');
  };
}