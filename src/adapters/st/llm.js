// 副模型传输（薄适配层）
// 两条路：1) ST 连接配置（ConnectionManagerRequestService）2) 自填 BaseURL/Key 走 ST 服务端代理
// 第二条不依赖 ST 里预先建好配置，也不会有浏览器 CORS 问题。

function c() {
    return globalThis.SillyTavern?.getContext?.() ?? {};
}

export function transportAvailable() {
    const ctx = c();
    return typeof ctx.ConnectionManagerRequestService?.sendRequest === 'function'
        || typeof ctx.getRequestHeaders === 'function';
}

/** 走 ST 里已有的连接配置 */
export async function requestCompletion(messages, { profileId = '', maxTokens = 320 } = {}) {
    const ctx = c();
    const svc = ctx.ConnectionManagerRequestService;
    if (!svc?.sendRequest) throw new Error('no-transport');
    if (!profileId) throw new Error('no-profile');
    const res = await svc.sendRequest(profileId, messages, maxTokens);
    return typeof res === 'string' ? res : (res?.content ?? '');
}

/** 把用户填的 base 补成完整的 chat/completions 地址 */
export function normalizeUrl(baseUrl) {
    const b = String(baseUrl ?? '').trim().replace(/\/+$/, '');
    if (!b) return '';
    if (/\/chat\/completions$/.test(b)) return b;
    return b + '/chat/completions';
}

/** 从上游返回里挖出文本（OpenAI 兼容的几种形状都试） */
export function pickText(json) {
    if (typeof json === 'string') return json;
    const ch = json?.choices?.[0];
    if (ch) {
        if (typeof ch.message?.content === 'string') return ch.message.content;
        if (Array.isArray(ch.message?.content)) {
            return ch.message.content.map(x => x?.text ?? '').join('');
        }
        if (typeof ch.text === 'string') return ch.text;
    }
    // 有些端点直接返回 { content: '...' }
    if (typeof json?.content === 'string') return json.content;
    return '';
}

/**
 * 走 ST 服务端代理打任意 OpenAI 兼容端点（不建配置也能用）
 * @param {object} o
 * @param {string} o.baseUrl  https://api.siliconflow.cn/v1
 * @param {string} o.apiKey   sk-...
 * @param {string} o.model    Qwen/Qwen2.5-7B-Instruct
 * @param {Array}  o.messages
 */
export async function requestCustom({
    baseUrl, apiKey, model, messages,
    maxTokens = 320, temperature = 0.3, extraBody = null,
} = {}) {
    const ctx = c();
    const url = normalizeUrl(baseUrl);
    if (!url) throw new Error('no-base-url');
    if (!model) throw new Error('no-model');

    const headers = typeof ctx.getRequestHeaders === 'function'
        ? { ...ctx.getRequestHeaders() }
        : { 'Content-Type': 'application/json' };
    headers['Content-Type'] = 'application/json';

    const payload = {
        chat_completion_source: 'custom',
        custom_url: url,
        custom_model: model,
        custom_include_headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
        custom_include_body: {
            temperature,
            ...(extraBody ?? {}),
        },
        messages,
        max_tokens: maxTokens,
        stream: false,
        temperature,
    };

    const res = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
        const brief = text.slice(0, 160).replace(/\s+/g, ' ');
        throw new Error('HTTP ' + res.status + (brief ? ' · ' + brief : ''));
    }
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        return text;
    }
    if (json?.error) {
        const msg = json?.message ?? json?.error?.message ?? 'upstream_error';
        throw new Error(String(msg).slice(0, 160));
    }
    return pickText(json);
}

/** 一次最小连通性测试 */
export async function probeModel(cfg, { timeoutMs = 20000 } = {}) {
    const t0 = (globalThis.performance?.now?.() ?? Date.now());
    const run = cfg.profileId
        ? requestCompletion([{ role: 'user', content: '只回复两个字：收到' }], { profileId: cfg.profileId, maxTokens: 32 })
        : requestCustom({
            baseUrl: cfg.baseUrl,
            apiKey: cfg.apiKey,
            model: cfg.model,
            messages: [{ role: 'user', content: '只回复两个字：收到' }],
            maxTokens: 32,
        });

    const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + timeoutMs + 'ms')), timeoutMs));
    try {
        const text = await Promise.race([run, timer]);
        const ms = Math.round((globalThis.performance?.now?.() ?? Date.now()) - t0);
        return { ok: true, ms, text: String(text ?? '').trim().slice(0, 40) };
    } catch (e) {
        return { ok: false, msg: e?.message ?? String(e) };
    }
}

/**
 * 拉取该端点可用的模型列表。
 * 走 ST 的 /api/backends/chat-completions/status，它会去 GET {baseUrl}/models。
 * @returns {Promise<string[]>}
 */
export async function listModels({ baseUrl, apiKey } = {}) {
    const ctx = c();
    const url = String(baseUrl ?? '').trim().replace(/\/+$/, '');
    if (!url) throw new Error('no-base-url');

    const headers = typeof ctx.getRequestHeaders === 'function'
        ? { ...ctx.getRequestHeaders() }
        : { 'Content-Type': 'application/json' };
    headers['Content-Type'] = 'application/json';

    const res = await fetch('/api/backends/chat-completions/status', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            chat_completion_source: 'custom',
            custom_url: url,
            custom_include_headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
        }),
    });

    const text = await res.text();
    if (!res.ok) {
        const brief = text.slice(0, 160).replace(/\s+/g, ' ');
        throw new Error('HTTP ' + res.status + (brief ? ' · ' + brief : ''));
    }
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error('返回不是 JSON');
    }
    const arr = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
    const ids = arr.map(x => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
    if (!ids.length) throw new Error('端点没有返回任何模型');
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
