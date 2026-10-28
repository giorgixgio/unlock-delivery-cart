import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createWebhookHandler, type WebhookLog } from './handler.ts';

function setup(saveOverride?: (row: WebhookLog) => Promise<void>) {
  const rows: WebhookLog[] = [];
  const tasks: Promise<void>[] = [];
  const handler = createWebhookHandler({ token: () => 'test-only-credential', corsHeaders: {},
    save: saveOverride ?? (async (row) => { rows.push(row); }),
    background: (task) => { tasks.push(task); },
  });
  return { handler, rows, tasks };
}

Deno.test('missing and incorrect tokens return 401 without logging', async () => {
  const { handler, rows, tasks } = setup();
  for (const query of ['', '?token=incorrect']) {
    assertEquals((await handler(new Request(`https://example.test/${query}`))).status, 401);
  }
  assertEquals(rows.length, 0);
  assertEquals(tasks.length, 0);
});

Deno.test('valid POST returns 200 and captures JSON without authentication credentials', async () => {
  const { handler, rows, tasks } = setup();
  const response = await handler(new Request('https://example.test/?token=test-only-credential&status=delivered', {
    method: 'POST', headers: { authorization: 'private', cookie: 'private', 'x-forwarded-for': '192.0.2.1, 192.0.2.2' },
    body: '{"tracking":"sample","echo":"test-only-credential"}',
  }));
  assertEquals(response.status, 200);
  await Promise.all(tasks);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].method, 'POST');
  assertEquals(rows[0].source_ip, '192.0.2.1');
  assertEquals(rows[0].headers.authorization, '[REDACTED]');
  assertEquals(rows[0].headers.cookie, '[REDACTED]');
  assertEquals(rows[0].query.token, ['[REDACTED]']);
  assertEquals(rows[0].body_json, { tracking: 'sample', echo: '[REDACTED]' });
});

Deno.test('valid GET captures repeated status query parameters and returns 200', async () => {
  const { handler, rows, tasks } = setup();
  assertEquals((await handler(new Request('https://example.test/?token=test-only-credential&status=a&status=b'))).status, 200);
  await Promise.all(tasks);
  assertEquals(rows[0].query.status, ['a', 'b']);
  assertEquals(rows[0].method, 'GET');
});

Deno.test('malformed JSON remains raw and returns 200', async () => {
  const { handler, rows, tasks } = setup();
  assertEquals((await handler(new Request('https://example.test/?token=test-only-credential', {
    method: 'POST', body: '{bad json',
  }))).status, 200);
  await Promise.all(tasks);
  assertEquals(rows[0].body_raw, '{bad json');
  assertEquals(rows[0].body_json, null);
});

Deno.test('logging failure does not change successful acknowledgement', async () => {
  const { handler, tasks } = setup(async () => { throw new Error('database unavailable'); });
  assertEquals((await handler(new Request('https://example.test/?token=test-only-credential'))).status, 200);
  await Promise.all(tasks);
});

Deno.test('slow logging does not block the response', async () => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const { handler, tasks } = setup(() => pending);
  const response = await handler(new Request('https://example.test/?token=test-only-credential'));
  assertEquals(response.status, 200);
  release?.();
  await Promise.all(tasks);
});