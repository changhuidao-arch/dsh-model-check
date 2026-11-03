import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDetector, generateChallenges, parseNumbers } from './vendor/lmfpd-sdk.js';

export const root = fileURLToPath(new URL('.', import.meta.url));
export const caveat = '这是参考库内的行为相似度排序，不能认证后台模型身份。系统提示、采样参数和渠道路由会影响结果；库外模型也可能与库内模型相似。';
const bank = JSON.parse(await readFile(join(root, 'data/unified_bank.json'), 'utf8'));
const sources = JSON.parse(await readFile(join(root, 'sources.json'), 'utf8'));
let detectorPromise;
export const detector = () => detectorPromise ??= loadDetector({ source: join(root, 'data') }).catch(error => { detectorPromise = undefined; throw error; });
export const metadata = () => ({ version: '1.0.0', bankBuiltAt: bank.built_at, models: bank.models.map(m => ({ id: m.id, name: m.display_name, family: m.family_name })), sources, caveat });
export const challenges = () => generateChallenges(3);

// Deliberately do not merge versions, tiers, or date suffixes into a claimed match.
export function comparison(model, analysis) {
  const declared = String(model || '').trim().toLowerCase();
  const known = bank.models.find(item => item.id.toLowerCase() === declared);
  if (!known) return { status: 'uncovered', label: '参考库未覆盖此模型名', declaredModel: model, referenceModel: analysis?.prediction || null };
  if (analysis?.decision !== 'scored' || analysis.used_outputs !== 3) return { status: 'insufficient', label: '有效证据不足', declaredModel: model, referenceModel: analysis?.prediction || null };
  return { status: analysis.prediction === known.id ? 'similar' : 'different', label: analysis.prediction === known.id ? '最接近声明模型' : '最接近其他模型，建议复测', declaredModel: model, referenceModel: analysis.prediction };
}

export function safeError(error, secret = '') {
  let text = error instanceof Error ? error.message : String(error);
  if (secret) text = text.split(secret).join('[已隐藏]');
  return text.replace(/(?:https?:\/\/)[^\s<>"']+/gi, '[接口地址]').replace(/\b(?:sk|sess)-[A-Za-z0-9_-]{8,}/g, '[已隐藏]').slice(0, 500);
}

export async function analyze(model, outputs) {
  if (!Array.isArray(outputs) || outputs.length !== 3 || outputs.some(o => typeof o.text !== 'string' || o.text.length > 100000 || !Number.isInteger(o.expected_count) || o.expected_count < 80 || o.expected_count > 1000)) throw new Error('需要三组回答，每组须包含文本和正确的要求数量。');
  const analysis = (await detector()).analyze(outputs, { strict: true });
  return { analysis, comparison: comparison(model, analysis), caveat, bankBuiltAt: bank.built_at };
}

export async function nativeFingerprint(llm, input, signal, progress) {
  if (!input.provider || !input.model) throw new Error('请选择 DSH 中已配置的模型。');
  const modelList = await llm.listModels(input.provider);
  if (!modelList.some(m => m.id === input.model)) throw new Error('该模型不在所选 DSH 提供商的模型列表中。');
  const tasks = challenges(), samples = [], outputs = [];
  for (let i = 0; i < tasks.length; i++) {
    signal.throwIfAborted();
    const task = tasks[i];
    const sample = { state: 'waiting', count: 0, expected_count: task.expected_count, text: '', usage: null, finish: null, error: null };
    samples.push(sample);
    progress({ stage: 'fingerprint', message: `正在采样 ${i + 1}/3`, samples });
    let finish, lastUpdate = 0;
    const oneSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
    try {
      for await (const chunk of llm.stream({
        provider: input.provider, model: input.model,
        ...(input.effort ? { reasoningEffort: input.effort } : {}),
        messages: [{ role: 'user', content: [{ type: 'text', text: task.prompt }] }],
        maxTokens: 4096, signal: oneSignal,
      })) {
        oneSignal.throwIfAborted();
        if (chunk.type === 'text-delta') {
          sample.text += chunk.text;
          if (sample.text.length > 100000) throw new Error('回答超过采样上限。');
          sample.count = parseNumbers(sample.text).length;
          sample.state = 'streaming';
          if (Date.now() - lastUpdate > 500) { progress({ stage: 'fingerprint', message: `正在采样 ${i + 1}/3`, samples }); lastUpdate = Date.now(); }
        } else if (chunk.type === 'usage') sample.usage = chunk.usage;
        else if (chunk.type === 'finish') finish = chunk.reason;
      }
      if (!finish || finish.kind !== 'stop') throw new Error(finish?.failure?.message || `采样未正常结束（${finish?.kind || '缺少结束帧'}），本轮不据此判断模型。`);
      sample.finish = finish.kind;
      sample.count = parseNumbers(sample.text).length;
      sample.state = sample.count >= Math.max(80, Math.ceil(task.expected_count * .55)) ? 'complete' : 'failed';
      if (sample.state === 'failed') sample.error = '回答中的有效整数不足。';
    } catch (error) {
      if (signal.aborted) throw error;
      sample.state = 'failed'; sample.error = safeError(error);
      // Authentication/transport errors are not evidence of a different model.
      progress({ stage: 'fingerprint', message: `采样 ${i + 1} 失败，已停止本轮`, samples });
      break;
    }
    outputs.push({ text: sample.state === 'complete' ? sample.text : '', expected_count: task.expected_count });
    progress({ stage: 'fingerprint', message: `已完成采样 ${i + 1}/3`, samples });
  }
  while (outputs.length < 3) outputs.push({ text: '', expected_count: tasks[outputs.length].expected_count });
  return { ...await analyze(input.model, outputs), challenges: tasks, samples, route: 'dsh', provider: input.provider, model: input.model, effort: input.effort || 'DSH 默认', maxTokens: 4096 };
}

export function validateApi(input) {
  let url;
  try { url = new URL(input.baseUrl); } catch { throw new Error('请输入有效的 API 地址。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址须为 HTTP(S)，不能包含账号、查询参数或片段。');
  if (typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.length > 8192) throw new Error('请输入 API Key。');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 256) throw new Error('请输入模型名。');
  if (!['responses', 'chat_completions', 'messages'].includes(input.api)) throw new Error('请选择正确的接口协议。');
}

export async function apiFingerprint(input, signal, progress) {
  validateApi(input);
  const instance = await detector();
  const samples = [];
  const failureControl = new AbortController();
  let failedSample;
  const result = await instance.detect({ baseUrl: input.baseUrl.trim(), apiKey: input.apiKey.trim(), model: input.model.trim(), api: input.api, effort: input.effort || '', count: 3, parallel: 1, strict: true, timeout: 120 }, {
    signal: AbortSignal.any([signal, failureControl.signal]),
    onSample(index, sample) {
      samples[index] = { ...sample, error: sample.error ? safeError(sample.error, input.apiKey) : null };
      progress({ stage: 'fingerprint', message: `指纹采样 ${index + 1}/3`, samples });
      if (sample.state === 'failed' && !failedSample) { failedSample = samples[index].error || '采样请求失败。'; failureControl.abort(); }
    },
  });
  signal.throwIfAborted();
  return { ...result, samples, error: failedSample || (result.error ? safeError(result.error, input.apiKey) : null), comparison: comparison(input.model, result.analysis), caveat, bankBuiltAt: instance.builtAt, route: 'api', model: input.model, api: input.api, effort: input.effort || '接口默认' };
}

export async function protocolCheck(input, signal, progress, pythonPath) {
  validateApi(input);
  if (input.api === 'responses') return { status: 'skipped', message: 'Model Check Core 尚不支持 Responses 原始协议检查；行为指纹检测仍可运行。' };
  const localPython = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = pythonPath || process.env.DSH_MODEL_CHECK_PYTHON || (existsSync(localPython) ? localPython : 'python');
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-u', join(root, 'python/bridge.py')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let buffer = '', result, errorText = '', settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { child.kill(); finish(new Error('检测已取消。')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('接口检查超时。')); }, 195000);
    signal.addEventListener('abort', abort, { once: true });
    child.on('error', error => finish(new Error(`无法启动 Python 检查：${safeError(error)}。请运行 scripts/setup-python.ps1。`)));
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 2000000) { child.kill(); finish(new Error('检查输出超过上限。')); return; }
      let pos;
      while ((pos = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, pos); buffer = buffer.slice(pos + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'result') result = event.value;
          else if (event.type === 'progress') progress({ stage: 'protocol', ...event.value });
        } catch { /* Only the JSON-lines bridge protocol is displayed. */ }
      }
    });
    child.stderr.on('data', chunk => { errorText = (errorText + chunk.toString('utf8')).slice(-2000); });
    child.on('close', code => {
      if (result) finish(null, result);
      else finish(new Error(`Python 检查未完成（${code}）：${safeError(errorText || '请检查依赖安装', input.apiKey)}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ base_url: input.baseUrl, api_key: input.apiKey, model: input.model, protocol: input.api }));
    if (signal.aborted) abort();
  });
}
