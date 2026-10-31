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
