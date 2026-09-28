// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { describe, expect, it } from 'bun:test';
import { EXPERIENTIAL_ORIGIN, inspectExperientialAccount, runSyntheticProbe, syntheticRequest, type Fetcher, type ProbeProtocol } from '../../scripts/lib/experiential-migration';
const key = `xpl_${'0'.repeat(40)}`;
const org = '00000000-0000-0000-0000-000000000001';
const json = (body: any, status = 200) => Response.json(body, { status, headers: { 'x-gateway-zdr': 'true' } });
const completion = { choices: [{ finish_reason: 'stop', message: { content: 'OK' } }], usage: { prompt_tokens: 7, completion_tokens: 1, cost: 0.00001 } };
function fixture(overrides: { capture?: unknown; training?: unknown; entitled?: unknown; policy?: any; catalog?: any; reply?: () => Response | Promise<Response> } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport: Fetcher = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST') return overrides.reply?.() ?? json(completion);
    if (url.endsWith('/api/whoami')) return json({ org_id: org });
    if (url.endsWith('/v1/models')) return json(overrides.catalog ?? { data: [{ id: 'gpt-5.4-nano', data_policy: { zdr_on_request: true } }] });
    if (url.endsWith('/telemetry-settings')) return json({ capture_prompt_content: overrides.capture ?? false });
    if (url.endsWith('/provider-policy')) return json({ zdr_entitled: Object.hasOwn(overrides, 'entitled') ? overrides.entitled : true,
      policy: overrides.policy ?? { require_no_training: overrides.training ?? true, require_zdr: false, zdr_continuation_storage: false } });
    throw new Error('Unexpected test URL');
  };
  return { transport, calls };
}
const probe = (transport: Fetcher, protocol: ProbeProtocol = 'chat') => runSyntheticProbe({ key, model: 'gpt-5.4-nano', protocol, allowSpend: true }, transport);
describe('Experiential migration preparation', () => {
  it.each(['chat', 'stream', 'tools', 'json-schema', 'responses', 'messages'] as ProbeProtocol[])('requires ZDR on every %s probe', protocol => {
    const model = protocol === 'messages' ? 'claude-sonnet-5' : protocol === 'responses' ? 'gpt-6-astra' : 'gpt-5.4-nano';
    const { body } = syntheticRequest(model, protocol);
    expect(body.provider).toEqual({ zdr: true });
    expect(body.previous_response_id).toBeUndefined();
  });
  it('rejects success without ZDR confirmation before consuming content', async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const { transport, calls } = fixture({ reply: () => new Response(body) });
    await expect(probe(transport)).rejects.toMatchObject({ code: 'zdr_response_not_confirmed_no_retry' });
    expect(cancelled).toBe(true);
    expect(calls.filter(c => c.init.method === 'POST')).toHaveLength(1);
  });
  it.each(['false', 'TRUE', 'true, false', ''])('rejects ambiguous ZDR response %j on JSON and SSE', async verdict => {
    for (const protocol of ['chat', 'stream'] as ProbeProtocol[]) {
      let cancelled = false;
      const body = new ReadableStream({ cancel() { cancelled = true; } });
      const { transport, calls } = fixture({ reply: () => new Response(body, { headers: { 'x-gateway-zdr': verdict } }) });
      await expect(probe(transport, protocol)).rejects.toMatchObject({ code: 'zdr_response_not_confirmed_no_retry' });
      expect(cancelled).toBe(true);
      expect(calls.filter(c => c.init.method === 'POST')).toHaveLength(1);
    }
  });
  it('allows entitled per-request ZDR with org capture on and org ZDR off', async () => {
    const { transport, calls } = fixture({ capture: true });
    expect(await probe(transport)).toMatchObject({ zdr_requested: true, zdr_response_confirmed: true, production_ready: false });
    const report = await inspectExperientialAccount(key, ['gpt-5.4-nano'], transport);
    expect(report.checks).toMatchObject({ prompt_capture_disabled: false, upstream_zero_retention: false, zdr_request_entitled: true });
    expect(JSON.parse(calls.find(c => c.init.method === 'POST')!.init.body as string).provider).toEqual({ zdr: true });
  });
  it('preserves the documented grandfathered org ZDR entitlement', async () => {
    const { transport } = fixture({ entitled: false, policy: { require_zdr: true, require_no_training: true, zdr_continuation_storage: false } });
    expect((await probe(transport)).zdr_response_confirmed).toBe(true);
  });
  it.each([undefined, {}, { zdr: false, zdr_on_request: false }, { zdr: 'true', zdr_on_request: 'true' }])('refuses missing or noncompliant model privacy metadata %j before dispatch', async data_policy => {
    const { transport, calls } = fixture({ catalog: { data: [{ id: 'gpt-5.4-nano', data_policy }] } });
    await expect(probe(transport)).rejects.toMatchObject({ code: 'model_has_no_verified_zdr_route' });
    expect(calls.every(c => c.init.method === 'GET')).toBe(true);
  });
  it('accepts a model with ZDR on every route', async () => {
    const { transport } = fixture({ catalog: { data: [{ id: 'gpt-5.4-nano', data_policy: { zdr: true } }] } });
    expect((await probe(transport)).zdr_requested).toBe(true);
  });
  it.each([
    [400, 'unsupported_parameter'], [403, 'needs_subscription'], [403, 'model_not_granted'],
  ])('never strips the ZDR requirement after %s %s', async (status, code) => {
    const { transport, calls } = fixture({ reply: () => json({ error: { code } }, status as number) });
    await expect(probe(transport)).rejects.toMatchObject({ code: 'request_rejected_no_retry', status });
    const posts = calls.filter(c => c.init.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].init.body as string).provider).toEqual({ zdr: true });
  });
  it('only reads the fixed API origin; catalog matches never imply production readiness', async () => {
    const { transport, calls } = fixture();
    const report = await inspectExperientialAccount(key, ['auto', 'gpt-5.4-nano', 'gpt-5.4-nano'], transport);
    expect(report.models).toEqual([{ id: 'auto', exact_catalog_match: false, zdr_route_available: false }, { id: 'gpt-5.4-nano', exact_catalog_match: true, zdr_route_available: true }]);
    expect(report.production_ready).toBe(false); expect(report.cutover_authorized).toBe(false);
    expect(report.unverified).toContain('shared_total_and_frontier_caps'); expect(calls).toHaveLength(4);
    for (const { url, init } of calls) {
      expect(new URL(url).origin).toBe(EXPERIENTIAL_ORIGIN); expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined(); expect(init.redirect).toBe('error');
      expect(init.headers).toEqual({ Authorization: `Bearer ${key}`, Accept: 'application/json' });
    }
    expect(JSON.stringify(report)).not.toContain(key);
  });
  it('requires spending approval before network activity', async () => {
    const { transport, calls } = fixture();
    await expect(runSyntheticProbe({ key, model: 'gpt-5.4-nano', protocol: 'chat', allowSpend: false }, transport)).rejects.toMatchObject({ code: 'explicit_spend_authorization_required' });
    expect(calls).toHaveLength(0);
  });
  it.each(['', 'sk-provider-secret', 'xpl_bad\r\nAuthorization: secret'])('rejects malformed credential %s locally', async invalid => {
    const { transport, calls } = fixture();
    await expect(inspectExperientialAccount(invalid, [], transport)).rejects.toMatchObject({ code: 'invalid_credential_format' });
    expect(calls).toHaveLength(0);
  });
  it('refuses untrusted organization paths', async () => {
    let count = 0;
    await expect(inspectExperientialAccount(key, [], async () => { count++; return json({ org_id: '../../keys' }); })).rejects.toMatchObject({ code: 'invalid_organization_response' });
    expect(count).toBe(1);
  });
  it.each([{ training: false }, { training: 'true' }, { entitled: false }, { entitled: 'true' }, { entitled: undefined }, { policy: {} }, { policy: { require_no_training: true, zdr_continuation_storage: true } }])('fails closed for privacy state %j', async options => {
    const { transport, calls } = fixture(options);
    await expect(probe(transport)).rejects.toMatchObject({ code: 'privacy_preflight_failed' });
    expect(calls.every(c => c.init.method === 'GET')).toBe(true);
  });
  it('does not substitute an unavailable model', async () => {
    const { transport, calls } = fixture({ catalog: { data: [{ id: 'vendor/gpt-5.4-nano' }] } });
    await expect(probe(transport)).rejects.toMatchObject({ code: 'model_not_in_authenticated_catalog' });
    expect(calls).toHaveLength(4);
  });
  it.each(['auto', 'glm-5.3-flash-reap50-iq3m', 'screenpipe-event-classifier', 'argus-trace-1', 'gemma4-e4b'])('excludes %s', async model => {
    const { transport, calls } = fixture();
    await expect(runSyntheticProbe({ key, model, protocol: 'chat', allowSpend: true }, transport)).rejects.toMatchObject({ code: 'unsupported_probe_model' });
    expect(calls).toHaveLength(0);
  });
  it('makes one bounded synthetic POST and does not claim settlement', async () => {
    const { transport, calls } = fixture(); const result = await probe(transport);
    const posts = calls.filter(c => c.init.method === 'POST'); expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(`${EXPERIENTIAL_ORIGIN}/v1/chat/completions`);
    expect(JSON.parse(posts[0].init.body as string)).toEqual({ model: 'gpt-5.4-nano', provider: { zdr: true }, messages: [{ role: 'user', content: 'Reply with OK.' }], max_completion_tokens: 64 });
    expect(result).toMatchObject({ input_tokens: 7, output_tokens: 1, inline_cost_usd: 0.00001, settlement_verified: false, native_policy_verified: false, production_ready: false });
    expect(JSON.stringify(result)).not.toContain('Reply with');
  });
  it.each([401, 402, 403, 409, 429, 500, 502])('does not retry or leak bodies after HTTP %s', async status => {
    const { transport, calls } = fixture({ reply: () => json({ error: { message: `secret ${key} customer prompt` } }, status) });
    await expect(probe(transport)).rejects.toMatchObject({ code: 'request_rejected_no_retry', status, message: `request_rejected_no_retry (HTTP ${status})` });
    expect(calls.filter(c => c.init.method === 'POST')).toHaveLength(1);
  });
  it('redacts disconnects without retrying an uncertain request', async () => {
    const { transport, calls } = fixture({ reply: () => { throw new Error(`disconnected ${key}`); } });
    await expect(probe(transport)).rejects.toMatchObject({ message: 'transport_failed_no_retry' });
    expect(calls.filter(c => c.init.method === 'POST')).toHaveLength(1);
  });
  it('validates fragmented SSE content, finish, usage and DONE', async () => {
    const text = [JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }), JSON.stringify({ choices: [{ finish_reason: 'stop', delta: {} }] }), JSON.stringify({ choices: [], usage: completion.usage }), '[DONE]'].map(x => `data: ${x}\r\n\r\n`).join('');
    const stream = new ReadableStream({ start(controller) { const bytes = new TextEncoder().encode(text); for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } });
    const { transport } = fixture({ reply: () => new Response(stream, { headers: { 'content-type': 'text/event-stream', 'x-gateway-zdr': 'true' } }) });
    expect(await probe(transport, 'stream')).toMatchObject({ output_tokens: 1 });
  });
  it.each(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', 'data: {"error":{"message":"private"}}\n\n', 'data: [DONE]\n\n'])('refuses incomplete or failed SSE without replay', async text => {
    const { transport, calls } = fixture({ reply: () => new Response(text, { headers: { 'content-type': 'text/event-stream', 'x-gateway-zdr': 'true' } }) });
    await expect(probe(transport, 'stream')).rejects.toBeDefined();
    expect(calls.filter(c => c.init.method === 'POST')).toHaveLength(1);
  });
  it('keeps unknown usage and cost unknown', async () => {
    const { transport } = fixture({ reply: () => json({ choices: completion.choices }) });
    await expect(probe(transport)).rejects.toMatchObject({ code: 'usage_missing_no_retry' });
    const other = fixture({ reply: () => json({ choices: completion.choices, usage: { prompt_tokens: 7, completion_tokens: 1 } }) });
    expect((await probe(other.transport)).inline_cost_usd).toBeNull();
  });
  it('validates tool arguments and structured output beyond HTTP 200', async () => {
    const { transport } = fixture();
    await expect(probe(transport, 'tools')).rejects.toMatchObject({ code: 'tool_call_missing' });
    await expect(probe(transport, 'json-schema')).rejects.toMatchObject({ code: 'structured_output_invalid' });
    const toolReply = fixture({ reply: () => json({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'confirm', arguments: '{"ok":true}' } }] } }], usage: completion.usage }) });
    expect((await probe(toolReply.transport, 'tools')).output_tokens).toBe(1);
  });
  it('pins stateless Astra and keeps native Messages separate', () => {
    const astra = syntheticRequest('gpt-6-astra', 'responses'); expect(astra.path).toBe('/v1/responses');
    expect(astra.body).toMatchObject({ store: false, reasoning: { effort: 'low' }, service_tier: 'standard', max_output_tokens: 64 });
    expect(astra.body.previous_response_id).toBeUndefined();
    const anthropic = syntheticRequest('claude-sonnet-5', 'messages'); expect(anthropic.path).toBe('/v1/messages'); expect(anthropic.body.max_tokens).toBe(64);
    expect(() => syntheticRequest('claude-sonnet-5', 'responses')).toThrow(); expect(() => syntheticRequest('gpt-6-astra', 'messages')).toThrow();
  });
});
