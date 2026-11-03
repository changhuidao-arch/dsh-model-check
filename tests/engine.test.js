import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { analyze, comparison, metadata, nativeFingerprint, apiFingerprint, protocolCheck, safeError, validateApi } from '../engine.js';
import { buildRequest } from '../vendor/lmfpd-sdk.js';
import { apply } from '../index.js';

const fixture = JSON.parse(await readFile(new URL('./reference-samples.json', import.meta.url), 'utf8'));

test('pinned reference detector agrees with the upstream conformance example', async () => {
  const result = await analyze(fixture.model, fixture.outputs);
  assert.equal(metadata().models.length, 64);
  assert.equal(result.analysis.decision, 'scored');
  assert.equal(result.analysis.used_outputs, 3);
  assert.equal(result.analysis.prediction, fixture.model);
  assert.equal(result.comparison.status, 'similar');
  assert.ok(result.analysis.results.every(r => Number.isFinite(r.score)));
});

test('unknown versions and tiers are not silently accepted as a known model', () => {
  const scored = { decision: 'scored', used_outputs: 3, prediction: 'gpt-6.1-terra' };
  assert.equal(comparison('gpt-6.1-terra', scored).status, 'similar');
  assert.equal(comparison('gpt-6.1-sol', scored).status, 'uncovered');
  assert.equal(comparison('gpt-6.1-terra-free', scored).status, 'uncovered');
  assert.equal(comparison('gpt-6-luna', scored).status, 'different');
});

test('missing samples cannot produce a matching identity', async () => {
  const report = await analyze(fixture.model, fixture.outputs.map((o, i) => i ? { ...o, text: '' } : o));
  assert.equal(report.analysis.decision, 'unscorable');
  assert.equal(report.comparison.status, 'insufficient');
  assert.equal(report.analysis.probability, null);
  await assert.rejects(analyze('gpt-6-luna', [{ text: '', expected_count: 300 }]), /三组/);
});

test('DSH samples are independent and contain no chat history, system prompt or tools', async () => {
  const calls = [];
  const llm = { listModels: async () => [{ id: fixture.model }], async *stream(call) {
    calls.push(call);
    yield { type: 'text-delta', index: 0, text: fixture.outputs[calls.length - 1].text };
    yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 800 } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } };
  const result = await nativeFingerprint(llm, { provider: 'test', model: fixture.model }, new AbortController().signal, () => {});
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.messages.length === 1 && c.messages[0].role === 'user' && !c.system && !c.tools && !c.sessionId));
  assert.equal(new Set(calls.map(c => c.messages[0].content[0].text)).size, 3);
  assert.equal(result.analysis.used_outputs, 3);
});

test('DSH auth error stops after one attempt and cannot become a mismatch verdict', async () => {
  let calls = 0;
  const llm = { listModels: async () => [{ id: fixture.model }], async *stream() {
    calls++; yield { type: 'finish', reason: { kind: 'error', failure: { code: 'auth', message: 'HTTP 401 test-denied' } } };
  } };
  const result = await nativeFingerprint(llm, { provider: 'test', model: fixture.model }, new AbortController().signal, () => {});
  assert.equal(calls, 1);
  assert.equal(result.comparison.status, 'insufficient');
  assert.match(result.samples[0].error, /401/);
});

test('stream without terminal frame is not accepted even when it contains enough integers', async () => {
  const llm = { listModels: async () => [{ id: fixture.model }], async *stream() { yield { type: 'text-delta', text: fixture.outputs[0].text }; } };
  const result = await nativeFingerprint(llm, { provider: 'test', model: fixture.model }, new AbortController().signal, () => {});
  assert.equal(result.analysis.used_outputs, 0);
  assert.match(result.samples[0].error, /缺少结束帧/);
});

test('already-cancelled native job sends no model requests', async () => {
  const control = new AbortController(); control.abort();
  const llm = { listModels: async () => [{ id: fixture.model }], stream() { assert.fail('unexpected request'); } };
  await assert.rejects(nativeFingerprint(llm, { provider: 'test', model: fixture.model }, control.signal, () => {}));
});

test('three API dialects use the selected endpoint and expected auth header', () => {
  for (const [api, suffix, key] of [['responses', '/responses', 'Authorization'], ['chat_completions', '/chat/completions', 'Authorization'], ['messages', '/messages', 'x-api-key']]) {
    const req = buildRequest({ baseUrl: 'https://example.test/v1', apiKey: 'test-key', model: 'gpt-6-luna', api }, 'hello');
    assert.ok(req.url.endsWith(suffix)); assert.ok(req.headers[key].includes('test-key'));
  }
  assert.throws(() => validateApi({ baseUrl: 'https://user:pass@example.test', apiKey: 'x', model: 'x', api: 'messages' }));
  assert.doesNotMatch(safeError('token secret-value https://example.test/path', 'secret-value'), /secret-value|example\.test/);
});

test('real loopback HTTP transport parses SSE and scores local reference fixtures (not a live model)', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push({ path: req.url, body });
    const text = fixture.outputs[(requests.length - 1) % 3].text;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ model: fixture.model, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const result = await apiFingerprint({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'fixture-key', model: fixture.model, api: 'chat_completions' }, new AbortController().signal, () => {});
  assert.equal(requests.length, 3); assert.ok(requests.every(r => r.path === '/v1/chat/completions'));
  assert.equal(result.analysis.used_outputs, 3);
  assert.ok(result.samples.every(s => s.state === 'complete'));
  assert.ok(!JSON.stringify(result).includes('fixture-key'));
});

test('registers exact owner-protected Connection routes without replacing the RPC interceptor', async () => {
  const routes = new Map();
  const ctx = { connection: { fetch: { register(route) { routes.set(route.path, route); } } }, llm: {}, inject() {}, effect() {} };
  apply(ctx);
  const invoke = async (method, payload = {}) => (await (await routes.get(`/api/model-check/${method}`).fetch(new Request(`http://localhost/api/model-check/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'test', method: `model-check/${method}`, payload }) }))).json()).result;
  assert.equal(routes.size, 8);
  assert.equal((await invoke('info')).ok, true);
  const invalid = await invoke('start', { mode: 'api', apiKey: 'unique-secret', baseUrl: 'bad' });
  assert.equal(invalid.ok, false); assert.ok(!JSON.stringify(invalid).includes('unique-secret'));
  const malformed = await routes.get('/api/model-check/info').fetch(new Request('http://localhost/api/model-check/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(malformed.status, 400);
});

test('API authentication refusal sends only one request and removes the credential from errors', async t => {
  let count = 0;
  const secret = 'fixture-auth-secret';
  const server = createServer((_req, res) => { count++; res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: `Denied ${secret}` } })); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const result = await apiFingerprint({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: secret, model: fixture.model, api: 'chat_completions' }, new AbortController().signal, () => {});
  assert.equal(count, 1); assert.equal(result.analysis, null); assert.equal(result.comparison.status, 'insufficient');
  assert.ok(result.error); assert.ok(!JSON.stringify(result).includes(secret));
});

test('Python bridge preserves the upstream refusal of a loopback diagnostic target', async () => {
  const result = await protocolCheck({ baseUrl: 'https://127.0.0.1:1', apiKey: 'local-fixture-secret', model: 'gpt-6-luna', api: 'chat_completions' }, new AbortController().signal, () => {});
  assert.equal(result.status, 'incomplete'); assert.equal(result.overall, null);
  assert.equal(result.error.code, 'UnsafeTargetError');
  assert.ok(!JSON.stringify(result).includes('local-fixture-secret'));
});
