// 借用小白X（LittleWhiteBox）的剧情摘要：它在 chat_metadata 里，我们能直接读
/**
 * @param {object} chatMeta  ctx().chatMetadata
 * @returns {object|null} {events, characters, arcs, facts, aliases} 或 null
 */
export function readLwbSummary(chatMeta) {
    try {
        const ext = chatMeta?.extensions?.LittleWhiteBox;
        const s = ext?.storySummary;
        if (!s || typeof s !== 'object') return null;
        const events = Array.isArray(s.events) ? s.events : [];
        const facts = Array.isArray(s.facts) ? s.facts : [];
        const arcs = Array.isArray(s.arcs) ? s.arcs : [];
        const chars = Array.isArray(s.characters?.main) ? s.characters.main : [];
        const aliases = Array.isArray(s.characterAliases) ? s.characterAliases : [];
        if (!events.length && !facts.length && !arcs.length) return null;
        return { events, facts, arcs, chars, aliases };
    } catch {
        return null;
    }
}

/** 压成一小段给副模型看的「前情」 */
export function formatLwbBrief(sum, { maxEvents = 3, maxFacts = 4 } = {}) {
    if (!sum) return '';
    const lines = [];

    const evs = sum.events.slice(-maxEvents).map(e => {
        const title = String(e?.title ?? '').slice(0, 20);
        const who = (e?.participants ?? []).slice(0, 3).join('、');
        const time = String(e?.timeLabel ?? '').slice(0, 12);
        const sum2 = String(e?.summary ?? '').slice(0, 40);
        return [time, title, who, sum2].filter(Boolean).join('｜');
    }).filter(Boolean);
    if (evs.length) lines.push(`前情:${evs.join(' // ')}`);

    const fs = sum.facts
        .filter(f => !f?.retracted)
        .slice(-maxFacts)
        .map(f => `${String(f?.p ?? '').slice(0, 8)}=${String(f?.o ?? '').slice(0, 12)}`)
        .filter(x => x.length > 2);
    if (fs.length) lines.push(`事实:${fs.join('、')}`);

    const arcs = sum.arcs
        .slice(-3)
        .map(a => `${String(a?.name ?? '').slice(0, 6)}${String(a?.trajectory ?? a?.phase ?? '').slice(0, 14)}`)
        .filter(x => x.length > 2);
    if (arcs.length) lines.push(`弧光:${arcs.join('、')}`);

    return lines.join('\n');
}

/** 有没有可用的数据（面板诊断用） */
export function lwbStats(chatMeta) {
    const s = readLwbSummary(chatMeta);
    if (!s) return { ok: false, events: 0, facts: 0, arcs: 0 };
    return { ok: true, events: s.events.length, facts: s.facts.length, arcs: s.arcs.length };
}

/**
 * 小白X 的别名对：[{from, to}]
 * from 是正文里出现过的叫法，to 是它认定的主名。
 */
export function lwbAliases(chatMeta) {
    try {
        const raw = chatMeta?.extensions?.LittleWhiteBox?.storySummary?.characterAliases;
        if (!Array.isArray(raw)) return [];
        return raw
            .map(a => ({ from: String(a?.from ?? '').trim(), to: String(a?.to ?? '').trim() }))
            .filter(a => a.from && a.to && a.from !== a.to);
    } catch {
        return [];
    }
}

/**
 * 把别名挂到我们的角色 id 上。
 * @returns {Map<string, string[]>} id → 额外别名
 */
export function aliasMapForActors(pack, chatMeta) {
    const out = new Map();
    const pairs = lwbAliases(chatMeta);
    if (!pairs.length) return out;
    const actors = Object.values(pack?.index?.actor ?? {});
    for (const { from, to } of pairs) {
        const hit = actors.find(a => a.name === to || (a.aliases ?? []).includes(to));
        if (!hit) continue;
        const list = out.get(hit.id) ?? [];
        if (!list.includes(from)) list.push(from);
        out.set(hit.id, list);
    }
    return out;
}

/**
 * 只挑和这些人有关的事实：`沈述 位置=在逃`
 * @returns {string[]}
 */
export function factsForCast(chatMeta, names = [], limit = 6) {
    const sum = readLwbSummary(chatMeta);
    if (!sum || !names.length) return [];
    const want = new Set(names.filter(Boolean));
    const out = [];
    for (const f of sum.facts) {
        if (f?.retracted) continue;
        const subj = String(f?.s ?? '').trim();
        if (!subj) continue;
        const hit = [...want].some(n => subj.includes(n) || n.includes(subj));
        if (!hit) continue;
        const p = String(f?.p ?? '').trim();
        const o = String(f?.o ?? '').trim();
        if (!p && !o) continue;
        out.push(`${subj} ${p}${p && o ? '=' : ''}${o}`);
        if (out.length >= limit) break;
    }
    return out;
}

/** 关系对象的字段名不固定，挨个试 */
function relOf(r) {
    const pick = (keys) => {
        for (const k of keys) {
            const v = r?.[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return '';
    };
    return {
        from: pick(['from', 'a', 'source', 'left']),
        to: pick(['to', 'b', 'target', 'right']),
        state: pick(['state', 'label', 'relation', 'status', 'rel', 'value', 'type']),
        note: pick(['note', 'desc', 'detail', 'summary']),
    };
}

/**
 * 和这些人有关的关系：`霍振→白景昭:亲密`
 */
export function relationsFor(chatMeta, names = [], limit = 6) {
    try {
        const raw = chatMeta?.extensions?.LittleWhiteBox?.storySummary?.characters?.relationships;
        if (!Array.isArray(raw) || !names.length) return [];
        const want = new Set(names.filter(Boolean));
        const out = [];
        for (const r of raw) {
            const { from, to, state, note } = relOf(r);
            if (!from || !to) continue;
            const hit = want.has(from) || want.has(to)
                || [...want].some(n => from.includes(n) || to.includes(n));
            if (!hit) continue;
            const tail = state || String(note ?? '').slice(0, 12);
            out.push(`${from}→${to}${tail ? ':' + tail : ''}`);
            if (out.length >= limit) break;
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * 角色弧光：`霍振:从执行者到敢劝`
 */
export function arcsFor(chatMeta, names = [], limit = 4) {
    try {
        const raw = chatMeta?.extensions?.LittleWhiteBox?.storySummary?.arcs;
        if (!Array.isArray(raw) || !names.length) return [];
        const want = new Set(names.filter(Boolean));
        const out = [];
        for (const a of raw) {
            const name = String(a?.name ?? a?.id ?? '').trim();
            if (!name) continue;
            const hit = want.has(name) || [...want].some(n => name.includes(n) || n.includes(name));
            if (!hit) continue;
            const traj = String(
                a?.trajectory ?? a?.phase ?? a?.stage ?? a?.state ?? a?.note ?? a?.desc ?? '',
            ).trim();
            const prog = a?.progress ?? a?.percent ?? '';
            const tail = [traj.slice(0, 24), prog ? `${prog}%` : ''].filter(Boolean).join('·');
            out.push(tail ? `${name}:${tail}` : name);
            if (out.length >= limit) break;
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * 和在场者有关的前情事件：`九月十四｜城破｜霍振、白景昭｜北门被开`
 */
export function eventsForCast(chatMeta, names = [], limit = 3) {
    const sum = readLwbSummary(chatMeta);
    if (!sum || !names.length) return [];
    const want = new Set(names.filter(Boolean));
    const picked = [];
    // 从后往前挑（最近的优先），只挑提到这些人的
    for (let i = sum.events.length - 1; i >= 0 && picked.length < limit; i--) {
        const e = sum.events[i];
        const people = (e?.participants ?? []).map(String);
        const hit = people.some(p => want.has(p) || [...want].some(n => p.includes(n) || n.includes(p)));
        if (!hit) continue;
        const bits = [
            String(e?.timeLabel ?? '').slice(0, 12),
            String(e?.title ?? '').slice(0, 16),
            String(e?.summary ?? '').slice(0, 40),
        ].filter(Boolean);
        if (bits.length) picked.push(bits.join('｜'));
    }
    return picked.reverse();
}
