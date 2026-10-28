// Outbound fetch through the QuotaGuard static-IP proxy (used for Onway API calls).
let client: Deno.HttpClient | null = null;

function getClient(): Deno.HttpClient {
  if (client) return client;
  const url = Deno.env.get('QUOTAGUARD_URL');
  if (!url) throw new Error('QUOTAGUARD_URL is not configured');
  client = Deno.createHttpClient({ proxy: { url } });
  return client;
}

export function proxyFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  return fetch(input, { ...init, client: getClient() } as any);
}
