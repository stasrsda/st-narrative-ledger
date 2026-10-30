// 副模型协议：只认这些字段，别的丢掉
export const KINDS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function emptyPayload() {
    return { results: [], motives: [], beats: [], codeHits: [], happened: [], knows: [] };
}

/**
 * 校验并清洗副模型返回
 * @param {string|object} raw JSON 字符串或对象
 * @param {object} o
 * @param {Set<string>} [o.actorIds] 只保留在册角色
 * @param {string} [o.text] 用来核对 quote 是否真的在正文里
 */
export function normalizeSettle(raw, { actorIds = null, text = '' } = {}) {
    let obj = raw;
    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(stripFence(raw));
        } catch {
            return { ok: false, error: 'invalid_json', data: emptyPayload() };
        }
    }
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'not_object', data: emptyPayload() };

    const data = emptyPayload();

    for (const r of asArray(obj.results)) {
        if (!r?.actor || !KINDS.includes(r.kind)) continue;
        if (actorIds && !actorIds.has(r.actor)) continue;
        data.results.push({ actor: r.actor, kind: r.kind, note: truncate(r.note, 40), quote: pickQuote(r.quote, text) });
    }
    for (const b of asArray(obj.beats)) {
        if (!b?.actor || !b.id) continue;
        if (actorIds && !actorIds.has(b.actor)) continue;
        data.beats.push({ actor: b.actor, id: String(b.id) });
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
