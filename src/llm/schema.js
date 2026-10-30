// 副模型协议：只认这些字段，别的丢掉
export const KINDS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function emptyPayload() {
    // 记录被丢掉的条目，便于面板排查
    return { results: [],
        dropped: [], motives: [], beats: [], codeHits: [], happened: [], knows: [], intimate: [] };
}

/**
 * 校验并清洗副模型返回
 * @param {string|object} raw JSON 字符串或对象
 * @param {object} o
 * @param {Set<string>} [o.actorIds] 只保留在册角色
 * @param {string} [o.text] 用来核对 quote 是否真的在正文里
 */
/**
 * 把模型给的东西解析成角色 id：
 * 认 id、认全名、认别称（模型经常直接写「霍振」而不是 huozhen）。
 */
export function resolveActor(raw, actorIds = null, aliasMap = null) {
    const v = String(raw ?? '').trim();
    if (!v) return null;
    if (actorIds && actorIds.has(v)) return v;
    if (aliasMap) {
        if (aliasMap.has(v)) return aliasMap.get(v);
        // 允许「霍振说他」这类带后缀的写法
        for (const [name, id] of aliasMap) {
            if (name.length >= 2 && v.includes(name)) return id;
        }
    }
    return actorIds ? null : v;
}

export function normalizeSettle(raw, { actorIds = null, aliasMap = null, text = '' } = {}) {
    let obj = raw;
    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(stripFence(raw));
        } catch {
            const salvaged = extractJson(raw);
            if (!salvaged) return { ok: false, error: 'invalid_json', data: emptyPayload() };
            obj = salvaged;
        }
    }
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'not_object', data: emptyPayload() };

    const data = emptyPayload();

    for (const r of asArray(obj.results)) {
        if (!r?.actor || !KINDS.includes(r.kind)) continue;
        const id = resolveActor(r.actor, actorIds, aliasMap);
        if (!id) { data.dropped.push({ raw: r.actor, why: '认不出这个角色' }); continue; }
        data.results.push({ actor: id, kind: r.kind, note: truncate(r.note, 40), quote: pickQuote(r.quote, text) });
    }
    for (const b of asArray(obj.beats)) {
        if (!b?.actor || !b.id) continue;
        const id = resolveActor(b.actor, actorIds, aliasMap);
        if (!id) { data.dropped.push({ raw: b.actor, why: '节拍：认不出角色' }); continue; }
        data.beats.push({ actor: id, id: String(b.id) });
    }
    for (const c of asArray(obj.codeHits)) {
        if (!c?.id) continue;
        data.codeHits.push({ id: String(c.id), kind: c.kind === 'law' ? 'law' : c.kind === 'house' ? 'house' : 'rite' });
    }
    for (const h of asArray(obj.happened).slice(0, 1)) {
        if (!h?.name) continue;
        data.happened.push({ name: truncate(h.name, 20), quote: pickQuote(h.quote, text) });
    }
    for (const k of asArray(obj.knows)) {
        if (!k?.actor || !k.fact) continue;
        data.knows.push({ actor: k.actor, fact: String(k.fact) });
    }
    for (const it of asArray(obj.intimate).slice(0, 1)) {
        if (!it?.actor) continue;
        if (actorIds && !actorIds.has(it.actor)) continue;
        data.intimate.push({ actor: it.actor, phase: String(it.phase ?? 'mid') });
    }
    for (const m of asArray(obj.motives)) {
        if (!m?.actor || !m.id) continue;
        data.motives.push({ actor: m.actor, id: String(m.id) });
    }
    return { ok: true, error: null, data };
}

function asArray(v) {
    return Array.isArray(v) ? v : [];
}

function truncate(v, n) {
    const s = String(v ?? '').trim();
    return s.length > n ? s.slice(0, n) : s;
}

function stripFence(s) {
    return String(s).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/** quote 必须能在正文里定位，否则丢掉 */
function pickQuote(quote, text) {
    const q = truncate(quote, 20);
    if (!q) return '';
    if (!text) return q;
    return String(text).includes(q) ? q : '';
}

/**
 * 从任意文本里抠出第一个完整 JSON 对象。
 * 有些模型（如 Qwen3 开思考）会先输出一段推理，再给 JSON；
 * 直接 JSON.parse 会失败，这里按括号配平切一刀。
 */
export function extractJson(text) {
    const s = String(text ?? '');
    const start = s.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(s.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}
