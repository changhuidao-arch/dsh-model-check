window.__ModuleLoader__.load({
  id: 'dsh-model-check',
  factory: require => {
    const React = require('react');
    const { useState, useEffect } = React;
    const h = React.createElement;
    const PANEL = 'model-check';
    const css = `
      .mc-root{height:100%;overflow:auto;background:var(--background,#f7f8fa);color:var(--foreground,#222);font:14px/1.6 system-ui,sans-serif}
      .mc-wrap{max-width:1050px;margin:0 auto;padding:36px 32px 60px}.mc-root h1{font-size:28px;margin:0 0 6px;letter-spacing:-.5px}.mc-root h2{font-size:17px;margin:0 0 14px}.mc-muted{color:#727a87}.mc-badge{display:inline-block;color:#365fbb;background:#eaf0ff;padding:3px 10px;border-radius:20px;font-size:12px;margin-bottom:12px}
      .mc-card{border:1px solid #dce1e9;background:var(--card,#fff);border-radius:14px;padding:23px;margin-top:20px}.mc-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0 4px}.mc-root button{font:inherit;padding:9px 15px;border-radius:8px;border:1px solid #ced5e0;background:var(--card,#fff);color:inherit;cursor:pointer}.mc-root button:disabled{opacity:.5;cursor:wait}.mc-root button.mc-primary,.mc-tabs .mc-selected{background:#4168db;color:white;border-color:#4168db}.mc-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mc-root label{display:block;font-weight:500}.mc-root input:not([type=checkbox]),.mc-root select,.mc-root textarea{display:block;box-sizing:border-box;width:100%;background:var(--background,#fff);color:inherit;border:1px solid #ccd4e0;border-radius:8px;font:inherit;margin:7px 0 0;padding:9px 11px}.mc-root textarea{min-height:100px;resize:vertical}.mc-actions{display:flex;gap:10px;margin-top:20px;align-items:center;flex-wrap:wrap}.mc-info{border-left:3px solid #809ae2;padding:8px 12px;background:#f1f5ff;color:#435477;margin-top:15px;font-size:13px}.mc-error{background:#fff1ef;color:#a5352b;padding:12px;border-radius:8px;margin-top:15px;white-space:pre-wrap}.mc-root table{border-collapse:collapse;width:100%;font-size:13px}.mc-root td,.mc-root th{text-align:left;padding:10px;border-bottom:1px solid #e4e8ef;overflow-wrap:anywhere}.mc-root progress{width:100%;height:8px;accent-color:#4168db}.mc-sample{margin:15px 0}.mc-result-label{font-size:23px;font-weight:650;margin-bottom:5px}.mc-root details{margin-top:15px}.mc-root pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6fa;color:#26364e;padding:14px;border-radius:8px;font-size:12px;max-height:300px;overflow:auto}.mc-root a{color:#4168db}.mc-check{display:flex!important;gap:8px;align-items:center;margin-top:16px}.mc-small{font-size:12px}.mc-result-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.mc-stats{display:flex;gap:25px;flex-wrap:wrap;margin:18px 0}.mc-stat strong{display:block;font-size:20px}.mc-scroll{overflow:auto}@media(max-width:700px){.mc-grid{grid-template-columns:1fr}.mc-wrap{padding:24px 16px}.mc-card{padding:17px}}
    `;
    const labels = { complete: '完成', truncated: '已取样', failed: '失败', waiting: '等待响应', streaming: '采样中', cancelled: '已取消', queued: '排队' };
    const inputField = (title, value, change, props = {}) => h('label', null, title, h('input', { value, onChange: e => change(e.target.value), ...props }));
    function Results({ report, saveReport }) {
      const [saving, setSaving] = useState(false), [saveMessage, setSaveMessage] = useState('');
      const save = async () => {
        setSaving(true); setSaveMessage('');
        try { const result = await saveReport(report); setSaveMessage(result.status === 'saved' ? `已保存：${result.path}` : result.status === 'cancelled' ? '已取消导出' : '已请求保存，请在下载或保存对话框中确认。'); }
        catch (error) { setSaveMessage(`导出失败：${error.message}`); }
        finally { setSaving(false); }
      };
      const fp = report.fingerprint || report, analysis = fp.analysis, ranking = analysis?.results?.slice(0, 8) || [];
      const probability = analysis?.probability;
      const protocol = report.protocol;
      return h('section', { className: 'mc-card' },
        h('div', { className: 'mc-result-head' }, h('div', null, h('h2', null, '检测结果'), h('div', { className: 'mc-result-label' }, fp.comparison?.label || '有效证据不足'), h('div', { className: 'mc-muted' }, `声明模型：${fp.model || fp.comparison?.declaredModel || '未填写'}`)), h('button', { disabled: saving, onClick: save }, saving ? '正在保存…' : '导出 JSON')),
        saveMessage && h('p', { role: 'status', className: 'mc-muted mc-small' }, saveMessage),
        h('div', { className: 'mc-stats' },
          h('div', { className: 'mc-stat' }, h('span', { className: 'mc-muted' }, '最接近候选'), h('strong', null, analysis?.prediction_name || '无法判分')),
          h('div', { className: 'mc-stat' }, h('span', { className: 'mc-muted' }, '库内匹配概率'), h('strong', null, probability == null ? '—' : `${(probability * 100).toFixed(1)}%`)),
          h('div', { className: 'mc-stat' }, h('span', { className: 'mc-muted' }, '有效样本'), h('strong', null, `${analysis?.used_outputs || 0} / 3`))),
        h('div', { className: 'mc-info' }, fp.caveat, ' 匹配概率只在这 64 个候选中比较，不是模型为真的概率。'),
        fp.error && h('div', { className: 'mc-error' }, fp.error),
        ranking.length > 0 && h('div', { className: 'mc-scroll' }, h('table', null, h('thead', null, h('tr', null, ...['候选模型', '家族', '排名分数', '库内概率'].map(x => h('th', { key: x }, x)))), h('tbody', null, ...ranking.map(row => h('tr', { key: row.model }, h('td', null, row.display_name || row.model), h('td', null, row.family_name || row.family), h('td', null, row.score.toFixed(3)), h('td', null, row.probability == null ? '—' : `${(row.probability * 100).toFixed(1)}%`)))))),
        analysis && h('p', { className: 'mc-muted mc-small' }, `判分状态：${analysis.decision} · 参考库：${fp.bankBuiltAt || '—'}`),
        protocol && h(React.Fragment, null, h('h2', { style: { marginTop: 25 } }, '接口兼容性检查'),
          h('p', null, protocol.message || `状态：${protocol.status} · 结论：${protocol.overall || '未形成结论'} · 得分：${protocol.score ?? '—'}`),
          protocol.error && h('div', { className: 'mc-error' }, protocol.error.message),
          protocol.dimensions?.length > 0 && h('div', { className: 'mc-scroll' }, h('table', null, h('tbody', null, ...protocol.dimensions.map(d => h('tr', { key: d.id }, h('td', null, d.name), h('td', null, { pass: '通过', fail: '不通过', na: '不适用 / 证据不足' }[d.result] || d.result), h('td', null, d.detail))))))),
        h('details', null, h('summary', null, '查看完整证据与采样参数'), h('pre', null, JSON.stringify(report, null, 2))));
    }
    function Page({ rpc, saveReport }) {
      const [info, setInfo] = useState(null), [providers, setProviders] = useState([]), [mode, setMode] = useState('dsh');
      const [route, setRoute] = useState(''), [effort, setEffort] = useState(''), [efforts, setEfforts] = useState([]);
      const [baseUrl, setBaseUrl] = useState(''), [apiKey, setApiKey] = useState(''), [model, setModel] = useState(''), [api, setApi] = useState('chat_completions'), [includeProtocol, setIncludeProtocol] = useState(false);
      const [job, setJob] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [manual, setManual] = useState([]), [report, setReport] = useState(null), [claimed, setClaimed] = useState('');
      const running = busy || job?.status === 'running';
      const selected = route ? JSON.parse(route) : null;
      const load = async () => {
        try {
          const [about, rows] = await Promise.all([rpc('info'), rpc('models')]); setInfo(about); setProviders(rows);
          if (about.activeJob) setJob(await rpc('status', { id: about.activeJob }));
          else if (about.recentJobs.length) { const last = await rpc('status', { id: about.recentJobs[about.recentJobs.length - 1].id }); setJob(last); if (last.result) setReport(last.result); }
        } catch (e) { setError(e.message); }
      };
      useEffect(() => { void load(); }, []);
      useEffect(() => {
        if (!route) { setEfforts([]); return; }
        let disposed = false; setEffort('');
        rpc('efforts', JSON.parse(route)).then(value => { if (!disposed) setEfforts(value.efforts || []); }).catch(() => { if (!disposed) setEfforts([]); });
        return () => { disposed = true; };
      }, [route]);
      useEffect(() => {
        if (!job?.id || job.status !== 'running') return;
        let stopped = false, timer;
        const poll = async () => {
          try { const next = await rpc('status', { id: job.id }); if (stopped) return; setJob(next); if (next.result) setReport(next.result); if (next.error) setError(next.error); if (next.status === 'running') timer = setTimeout(poll, 1000); }
          catch (e) { if (!stopped) { setError(e.message); timer = setTimeout(poll, 3000); } }
        };
        timer = setTimeout(poll, 400); return () => { stopped = true; clearTimeout(timer); };
      }, [job?.id, job?.status]);
      const start = async () => {
        setBusy(true); setError(''); setReport(null);
        try {
          const input = mode === 'dsh' ? { mode, ...selected, effort } : { mode, baseUrl, apiKey, model, api, effort, includeProtocol };
          const { id } = await rpc('start', input); setJob({ id, status: 'running', progress: { message: '准备采样' } }); setApiKey('');
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };
      const makeManual = async () => { setError(''); try { setManual((await rpc('challenges')).map(c => ({ ...c, text: '' }))); setReport(null); } catch (e) { setError(e.message); } };
      const scoreManual = async () => { setBusy(true); setError(''); try { setReport(await rpc('analyze', { model: claimed, outputs: manual.map(m => ({ text: m.text, expected_count: m.expected_count })) })); } catch (e) { setError(e.message); } finally { setBusy(false); } };
      return h('div', { className: 'mc-root' }, h('style', null, css), h('div', { className: 'mc-wrap' },
        h('span', { className: 'mc-badge' }, 'MODEL CHECK · 本地判分'), h('h1', null, '模型指纹检测'),
        h('p', { className: 'mc-muted', style: { margin: 0 } }, '通过三次独立采样，检查模型行为与参考库的相似程度。'),
        h('div', { className: 'mc-tabs' }, ...[['dsh', 'DSH 已配置模型'], ['api', '自定义 API'], ['manual', '手动回答比对']].map(([id, title]) => h('button', { key: id, className: mode === id ? 'mc-selected' : '', disabled: running, onClick: () => { setMode(id); setError(''); setEffort(''); } }, title))),
        h('section', { className: 'mc-card' },
          mode === 'dsh' && h(React.Fragment, null, h('h2', null, '选择模型'), h('div', { className: 'mc-grid' },
            h('label', null, 'DSH 模型', h('select', { value: route, disabled: running, onChange: e => setRoute(e.target.value) }, h('option', { value: '' }, '请选择…'), ...providers.filter(p => p.models.length).map(p => h('optgroup', { key: p.id, label: p.name }, ...p.models.map(m => h('option', { key: m.id, value: JSON.stringify({ provider: p.id, model: m.id }) }, m.name || m.id)))))),
            h('label', null, '推理档位', h('select', { value: effort, disabled: running, onChange: e => setEffort(e.target.value) }, h('option', { value: '' }, '沿用 DSH 默认'), ...efforts.map(e => h('option', { key: e.id, value: e.id }, e.name || e.id))))),
            h('p', { className: 'mc-muted mc-small' }, '使用 DSH 原有认证与路由，插件不读取密钥。每次发送 3 个独立请求，不附带聊天历史或工具。'),
            selected && info && !info.models.some(m => m.id.toLowerCase() === selected.model.toLowerCase()) && h('div', { className: 'mc-info' }, '参考库未覆盖这个精确模型名。仍可查看相近候选，但不会判为型号一致。')),
          mode === 'api' && h(React.Fragment, null, h('h2', null, '接口配置'), h('div', { className: 'mc-grid' },
            inputField('Base URL', baseUrl, setBaseUrl, { placeholder: 'https://api.example.com/v1', disabled: running, autoComplete: 'off' }),
            inputField('API Key（仅本次使用）', apiKey, setApiKey, { type: 'password', autoComplete: 'off', disabled: running }),
            inputField('模型名', model, setModel, { placeholder: '填写接口实际接受的模型 ID', disabled: running }),
            h('label', null, '接口协议', h('select', { value: api, disabled: running, onChange: e => setApi(e.target.value) }, ...[['chat_completions', 'OpenAI Chat Completions'], ['responses', 'OpenAI Responses'], ['messages', 'Anthropic Messages']].map(([id, title]) => h('option', { key: id, value: id }, title)))),
            inputField('推理档位（可选）', effort, setEffort, { placeholder: '留空沿用接口默认', disabled: running })),
            h('label', { className: 'mc-check' }, h('input', { type: 'checkbox', checked: includeProtocol, disabled: running || api === 'responses', onChange: e => setIncludeProtocol(e.target.checked) }), '同时运行 Model Check Core 接口兼容性检查'),
            h('p', { className: 'mc-muted mc-small' }, '请求由本机直接发往指定 API，按渠道计费；指纹为 3 次请求，勾选完整检查会增加多项探针请求。密钥不写磁盘，不发给指纹库网站。接口检查仅支持公网 Chat Completions / Messages。')),
          mode === 'manual' && h(React.Fragment, null, h('h2', null, '离线比对回答'), inputField('声明模型名（可选）', claimed, setClaimed),
            h('p', { className: 'mc-muted' }, '生成三条挑战，在同一模型的三个独立空白会话中各问一条，再原样粘贴完整回答。'),
            h('button', { disabled: running, onClick: makeManual }, manual.length ? '重新生成三条挑战' : '生成三条挑战'),
            ...manual.map((item, i) => h('div', { key: item.id, className: 'mc-sample' }, h('details', { open: true }, h('summary', null, `挑战 ${i + 1} · 要求 ${item.expected_count} 个整数`), h('pre', null, item.prompt)), h('textarea', { value: item.text, placeholder: `粘贴第 ${i + 1} 份原始回答`, onChange: e => setManual(old => old.map((m, j) => i === j ? { ...m, text: e.target.value } : m)) })))),
          h('div', { className: 'mc-actions' }, mode === 'manual' ? h('button', { className: 'mc-primary', disabled: running || manual.length !== 3 || manual.some(m => !m.text.trim()), onClick: scoreManual }, '本地判分') : h('button', { className: 'mc-primary', disabled: running || (mode === 'dsh' ? !route : !baseUrl || !apiKey || !model), onClick: start }, running ? '检测中…' : '开始检测'),
            job?.status === 'running' && h('button', { onClick: async () => { try { await rpc('cancel', { id: job.id }); } catch (e) { setError(e.message); } } }, '取消检测'),
            h('button', { disabled: running, onClick: load }, '刷新模型列表'))),
        error && h('div', { className: 'mc-error', role: 'alert' }, error),
        job?.status === 'running' && h('section', { className: 'mc-card', 'aria-live': 'polite' }, h('h2', null, job.progress?.message || '检测中'), ...(job.progress?.samples || []).map((s, i) => h('div', { key: i, className: 'mc-sample' }, h('div', null, `样本 ${i + 1} · ${labels[s.state] || s.state} · ${s.count || 0}/${s.expected_count}`), h('progress', { max: s.expected_count, value: s.count || 0 }), s.error && h('div', { className: 'mc-error' }, s.error)))),
        report && h(Results, { report, saveReport }),
        h('details', { className: 'mc-card' }, h('summary', null, `参考库与来源 · ${info?.models.length || '…'} 个模型`),
          h('p', { className: 'mc-muted' }, `参考库构建：${info?.bankBuiltAt || '正在读取'}；规则固定随插件安装，检测时不下载远端代码。`),
          h('p', { className: 'mc-muted' }, `对话检测工具：${info?.toolAvailable ? '已加载' : '暂不可用，可使用当前页面检测'}`),
          h('p', null, h('a', { href: 'https://github.com/dufeisolo/model-check-core', target: '_blank', rel: 'noreferrer' }, 'Model Check Core'), ' · ', h('a', { href: 'https://github.com/Ikaleio/lm-detector', target: '_blank', rel: 'noreferrer' }, 'LM Fingerpoint Detector')),
          h('p', { className: 'mc-small' }, info?.models.map(m => m.id).join(' · ')))));
    }
    function Icon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'M4 10a8 8 0 0 1 16 0M7 11a5 5 0 0 1 10 0v3a15 15 0 0 1-2 7M10 11a2 2 0 0 1 4 0v3a12 12 0 0 1-2 7M4 14v1a8 8 0 0 1-1 4M7 14v1a12 12 0 0 1-1 5M10 14v1a9 9 0 0 1-1 5M20 14a19 19 0 0 1-1 6' }));
    }
    return { inject: ['slots', 'connection', 'layout'], apply(ctx) {
      const rpc = async (method, input = {}) => { const result = await ctx.connection.rpc.call('/api', `model-check/${method}`, input); if (!result.ok) throw new Error(result.error?.message || '插件请求失败'); return result.value; };
      let downloadUrl;
      const saveReport = async report => {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = downloadUrl;
        anchor.download = `model-check-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.append(anchor); anchor.click(); anchor.remove();
        return { status: 'requested' };
      };
      ctx.effect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, 'model-check: report download');
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, inject: () => ({ rpc, saveReport }) }, Page));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 20, label: () => '模型指纹' }, Icon));
    } };
  }
});
