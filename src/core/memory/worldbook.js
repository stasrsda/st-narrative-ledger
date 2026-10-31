// 世界书条目：从扩展目录读 beiliang-v3.json，按关键字挑 1~2 条给副模型
let cache = null;      // { entries: [...] }
let loading = null;

export function keywordSet(entry) {
    const keys = [];
    const k = entry?.key;
    if (Array.isArray(k)) keys.push(...k);
    else if (typeof k === 'string' && k.trim()) keys.push(...k.split(','));
    // comment 里的「[L4] 沈家」这种也当作关键词
    const c = String(entry?.comment ?? '');
    const m = c.match(/\]\s*([^\s（(]+)/);
    if (m) keys.push(m[1]);
    return keys.map(x => String(x).trim()).filter(x => x.length >= 2);
}

/** 载入一次，之后走缓存 */
export async function loadWorldbook(url) {
    if (cache) return cache;
    if (loading) return loading;
    loading = (async () => {
        try {
            const res = await fetch(url);
            if (!res.ok) return { entries: [] };
            const j = await res.json();
            const raw = j?.entries ?? j ?? [];
            const entries = Array.isArray(raw) ? raw : Object.values(raw);
            cache = {
                entries: entries
                    .filter(e => e && !e.disable && String(e.content ?? '').trim())
                    .map(e => ({
                        comment: String(e.comment ?? ''),
                        keys: keywordSet(e),
                        content: String(e.content ?? ''),
                        order: Number(e.order ?? 100),
                    })),
            };
            return cache;
        } catch {
            return { entries: [] };
        } finally {
            loading = null;
        }
    })();
    return loading;
}

/**
 * 按当前场景挑条目：关键词命中越多越靠前；同分看 comment 的层级（L1 优先于 L6）
 * @returns {{comment:string, content:string}[]}
 */
export function pickWorldEntries(wb, { place = '', names = [], text = '' } = {}, limit = 2, maxChars = 420) {
    const entries = wb?.entries ?? [];
    if (!entries.length) return [];
    const hay = `${place} ${names.join(' ')} ${text}`;

    const scored = entries.map(e => {
        let score = 0;
        for (const k of e.keys) {
            if (!k) continue;
            if (hay.includes(k)) score += k.length >= 3 ? 3 : 2;
        }
        // 关卡层（L1 比 L6 更基础）
        const lv = Number((e.comment.match(/\[L(\d)\]/) ?? [])[1] ?? 9);
        score += Math.max(0, 6 - lv) * 0.5;
        return { e, score };
    }).filter(x => x.score >= 2);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ e }) => ({
        comment: e.comment,
        content: e.content.slice(0, maxChars),
    }));
}
