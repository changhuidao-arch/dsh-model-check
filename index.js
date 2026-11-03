import { randomUUID } from 'node:crypto';
import { metadata, challenges, analyze, nativeFingerprint, apiFingerprint, protocolCheck, safeError, validateApi } from './engine.js';

export const name = 'model-check';
export const inject = ['connection', 'llm'];

export function apply(ctx, config = {}) {
  const jobs = new Map();
  const controllers = new Map();
  let active;
  const clean = (value, secret = '') => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'string' && secret ? item.split(secret).join('[已隐藏]') : item));
  const get = id => { const job = jobs.get(id); if (!job) throw new Error('检测任务不存在。'); return job; };
  const start = input => {
    if (active) throw new Error('已有检测正在运行，请等待完成或先取消。');
    if (!input || !['dsh', 'api'].includes(input.mode)) throw new Error('请选择检测方式。');
    if (input.mode === 'api') validateApi(input);
    if (input.mode === 'dsh' && (!input.provider || !input.model)) throw new Error('请选择 DSH 模型。');
    if (input.model.length > 256 || (input.effort && (typeof input.effort !== 'string' || input.effort.length > 64))) throw new Error('模型或推理档位无效。');
    const id = randomUUID(), control = new AbortController();
    const job = { id, status: 'running', startedAt: new Date().toISOString(), model: input.model, mode: input.mode, progress: { message: '准备检测' }, result: null, error: null };
    jobs.set(id, job); controllers.set(id, control); active = id;
    while (jobs.size > 10) jobs.delete(jobs.keys().next().value);
    const progress = value => { if (job.status === 'running') job.progress = clean(value, input.apiKey); };
    (async () => {
      try {
        const signal = AbortSignal.any([control.signal, AbortSignal.timeout(600000)]);
        const fingerprint = input.mode === 'dsh'
          ? await nativeFingerprint(ctx.llm, input, signal, progress)
          : await apiFingerprint(input, signal, progress);
        let protocol = null;
        if (input.mode === 'api' && input.includeProtocol && fingerprint.error && fingerprint.samples.some(s => s.state === 'failed')) {
          protocol = { status: 'skipped', message: '指纹采样请求失败，本轮已停止，未继续发送接口探针。' };
        } else if (input.mode === 'api' && input.includeProtocol) {
          signal.throwIfAborted();
          progress({ stage: 'protocol', message: '正在执行 Model Check Core 接口检查' });
          try { protocol = await protocolCheck(input, signal, progress, config.pythonPath); }
          catch (error) { if (signal.aborted) throw error; protocol = { status: 'incomplete', error: { message: safeError(error, input.apiKey) } }; }
        }
        signal.throwIfAborted();
        job.result = clean({ fingerprint, protocol, version: '1.0.0', completedAt: new Date().toISOString() }, input.apiKey);
        job.status = 'completed'; job.progress = { message: '检测完成' };
      } catch (error) {
        job.status = control.signal.aborted ? 'cancelled' : 'failed';
        job.error = control.signal.aborted ? '检测已取消。' : safeError(error, input.apiKey);
      } finally {
        job.finishedAt = new Date().toISOString(); controllers.delete(id); if (active === id) active = undefined;
        // The completed job never retains the submitted credential or endpoint.
        input.apiKey = ''; input.baseUrl = '';
      }
    })();
    return { id };
  };

  const handlers = {
    info: () => ({ ...metadata(), toolAvailable: !!ctx.get?.('tools')?.get('model_fingerprint_check'), activeJob: active || null, recentJobs: [...jobs.values()].map(j => ({ id: j.id, status: j.status, model: j.model, startedAt: j.startedAt })) }),
    models: async () => {
      const providers = ctx.llm.listProviders();
      const rows = await Promise.all(providers.map(async provider => {
        try { return { id: provider.id, name: provider.name || provider.displayName || provider.id, models: await ctx.llm.listModels(provider.id) }; }
        catch { return { id: provider.id, name: provider.id, models: [], error: '模型列表暂不可用' }; }
      }));
      return rows;
    },
    efforts: async input => {
      const info = await ctx.llm.resolveModelInfo(input.provider, input.model);
      return info.reasoning || { efforts: [] };
    },
    start,
    status: input => get(input.id),
    cancel: input => { get(input.id); controllers.get(input.id)?.abort(); return { cancelled: !!controllers.get(input.id) }; },
    challenges,
    analyze: input => analyze(input.model, input.outputs),
  };
  // Connection owns origin checks, authentication, owner-only access and disposal
  // for exact Fetch routes. Its single /api RPC interceptor belongs to Typert.
  for (const [method, handler] of Object.entries(handlers)) {
    ctx.connection.fetch.register({
      path: `/api/model-check/${method}`, methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response('Expected JSON', { status: 415 });
        let envelope;
        try { envelope = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
        if (envelope?.type !== 'client-request' || typeof envelope.rpcId !== 'string' || envelope.method !== `model-check/${method}`) return new Response('Invalid RPC envelope', { status: 400 });
        const payload = envelope.payload || {};
        let result;
        try { result = { ok: true, value: await handler(payload) }; }
        catch (error) { result = { ok: false, error: { code: 'model-check/error', message: safeError(error, payload.apiKey), details: {} } }; }
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result }, { headers: { 'Cache-Control': 'no-store' } });
      },
    });
  }
  ctx.effect(() => () => { for (const control of controllers.values()) control.abort(); jobs.clear(); }, 'model-check: cancel active jobs');
  ctx.inject(['tools'], async toolCtx => {
    const { defineTool } = await import('@deepseek-ai/dsh-tools');
    toolCtx.tools.register(defineTool({
      name: 'model_fingerprint_check',
      description: '检测 DSH 已配置模型的行为指纹。list 列出模型；start 仅在用户要求检测时发送三次独立采样；status 查询结果；cancel 取消。结论是库内相似度，不能证明模型身份。不要索要或传入 API Key。',
      parameters: {
        action: { type: 'string', required: true, enum: ['list', 'start', 'status', 'cancel'], description: '操作' },
        provider: { type: 'string', description: 'list 返回的提供商 id' },
        model: { type: 'string', description: 'list 返回的模型 id' },
        effort: { type: 'string', description: '可选；省略沿用 DSH 默认档位' },
        id: { type: 'string', description: 'start 返回的检测任务 id' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
      async execute(args) {
        if (args.action === 'list') return { providers: await handlers.models(), reference: metadata() };
        if (args.action === 'start') return start({ mode: 'dsh', provider: args.provider, model: args.model, effort: args.effort });
        if (args.action === 'cancel') return handlers.cancel(args);
        return handlers.status(args);
      },
    }));
  });
}
