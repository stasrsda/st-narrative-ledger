// 借用小白X（LittleWhiteBox 3.2.3）的剧情记忆
// 真实结构（按 LWB 源码核对，不是猜的）：
//   chat_metadata.extensions.LittleWhiteBox.storySummary = {
//     json: { events[], facts[], characters{main[]}, arcs[], characterAliases[], keywords[] },
//     lastSummarizedMesId, summaryHistory[], updatedAt,
//   }
// 易错点：
//   · 数据在 storySummary.json 里，不在 storySummary 上
//   · events[].summary 末尾带 (#起始-结束) 楼层标记，读时剥掉
//   · facts[].since 是 0-based 楼层
//   · arcs[].progress 是 0..1 浮点
//   · characters 只有 main；关系图是 facts 里谓词「对X的…」的投影（没有 relationships 字段）
//   · facts[].trend 仅关系谓词才有，取值 破裂|厌恶|反感|陌生|投缘|亲密|交融
const EXT = 'LittleWhiteBox';

/** 剥掉 events.summary 末尾的 (#12-15) 楼层标记 */
export function stripFloorTag(text) {
    return String(text ?? '').replace(/\s*\(#\d+-\d+\)\s*$/, '').trim();
}

/** 取到 storySummary 的 json 层；没有就 null */
export function readLwbSummary(chatMeta) {
    try {
        const s = chatMeta?.extensions?.[EXT]?.storySummary;
        const j = s?.json;
        if (!j || typeof j !== 'object') return null;
        const events = Array.isArray(j.events) ? j.events : [];
        const facts = Array.isArray(j.facts) ? j.facts : [];
        const arcs = Array.isArray(j.arcs) ? j.arcs : [];
        const chars = Array.isArray(j.characters?.main) ? j.characters.main : [];
        const aliases = Array.isArray(j.characterAliases) ? j.characterAliases : [];
        const keywords = Array.isArray(j.keywords) ? j.keywords : [];
        if (!events.length && !facts.length && !arcs.length && !chars.length) return null;
        return {
            events, facts, arcs, chars, aliases, keywords,
            boundary: s?.lastSummarizedMesId ?? null,
            enabled: chatMeta?.extensions?.[EXT]?.storySummaryEnabled ?? null,
        };
    } catch {
        return null;
    }
}

/** main 里可能是字符串，也可能是 {name} */
function actorName(c) {
    return typeof c === 'string' ? c : String(c?.name ?? '');
}

function pctOf(v) {
    const n = Number(v);
    return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '';
}

/** 压成一小段给副模型看的「前情」 */
export function formatLwbBrief(sum, { maxEvents = 3, maxFacts = 4 } = {}) {
    if (!sum) return '';
    const lines = [];

    const evs = sum.events.slice(-maxEvents).map(e => {
        const title = String(e?.title ?? '').slice(0, 20);
        const who = (e?.participants ?? []).slice(0, 3).join('、');
        const time = String(e?.timeLabel ?? '').slice(0, 12);
        const body = stripFloorTag(e?.summary).slice(0, 40);
        const role = String(e?.memoryRole ?? '').slice(0, 6);
        return [time, title, who, role, body].filter(Boolean).join('｜');
    }).filter(Boolean);
    if (evs.length) lines.push(`前情:${evs.join(' // ')}`);

    const fs = sum.facts
        .filter(f => !f?.retracted)
        .slice(-maxFacts)
        .map(f => `${String(f?.s ?? '').slice(0, 6)} ${String(f?.p ?? '').slice(0, 10)}=${String(f?.o ?? '').slice(0, 12)}`)
        .filter(x => x.length > 3);
    if (fs.length) lines.push(`事实:${fs.join('、')}`);

    const arcs = sum.arcs
        .slice(-3)
        .map(a => `${String(a?.name ?? '').slice(0, 6)}${String(a?.trajectory ?? '').slice(0, 14)}${pctOf(a?.progress) ? `·${pctOf(a.progress)}` : ''}`)
        .filter(x => x.length > 2);
    if (arcs.length) lines.push(`弧光:${arcs.join('、')}`);

    return lines.join('\n');
}

/** 面板诊断用 */
export function lwbStats(chatMeta) {
    const s = readLwbSummary(chatMeta);
    if (!s) return { ok: false, events: 0, facts: 0, arcs: 0, chars: 0 };
    return {
        ok: true,
        events: s.events.length,
        facts: s.facts.length,
        arcs: s.arcs.length,
        chars: s.chars.length,
    };
}

/** 别名对：{from, to} */
export function lwbAliases(chatMeta) {
    const s = readLwbSummary(chatMeta);
    if (!s) return [];
    return s.aliases
        .map(a => ({ from: String(a?.from ?? '').trim(), to: String(a?.to ?? '').trim() }))
        .filter(a => a.from && a.to && a.from !== a.to);
}

/** 把别名挂到我们的角色 id 上：id → 额外别名[] */
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
 * 关系类谓词（对X的…）把 trend 作为关系状态标出来
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
        const state = String(f?.trend ?? '').trim();
        out.push(`${subj} ${p}${p && o ? '=' : ''}${o}${state ? `（关系:${state}）` : ''}`);
        if (out.length >= limit) break;
    }
    return out;
}

/**
 * 关系图：LWB 把关系存在 facts 里（谓词 `对X的…`），没有 relationships 字段
 * → `霍振→白景昭:亲密`
 */
export function relationsFor(chatMeta, names = [], limit = 6) {
    const sum = readLwbSummary(chatMeta);
    if (!sum || !names.length) return [];
    const want = new Set(names.filter(Boolean));
    const out = [];
    for (const f of sum.facts) {
        if (f?.retracted) continue;
        const m = String(f?.p ?? '').match(/^对(.+?)的/);
        if (!m) continue;
        const from = String(f?.s ?? '').trim();
        const to = m[1].trim();
        if (!from || !to) continue;
        if (!(want.has(from) || want.has(to))) continue;
        const state = String(f?.trend ?? f?.o ?? '').trim().slice(0, 8);
        out.push(`${from}→${to}${state ? ':' + state : ''}`);
        if (out.length >= limit) break;
    }
    return out;
}

/** 角色弧光：`霍振:从执行者到敢劝·40%` */
export function arcsFor(chatMeta, names = [], limit = 4) {
    const sum = readLwbSummary(chatMeta);
    if (!sum || !names.length) return [];
    const want = new Set(names.filter(Boolean));
    const out = [];
    for (const a of sum.arcs) {
        const name = String(a?.name ?? '').trim();
        if (!name) continue;
        const hit = want.has(name) || [...want].some(n => name.includes(n) || n.includes(name));
        if (!hit) continue;
        const traj = String(a?.trajectory ?? '').slice(0, 24);
        const pc = pctOf(a?.progress);
        out.push(`${name}${traj ? `:${traj}` : ''}${pc ? `·${pc}` : ''}`);
        if (out.length >= limit) break;
    }
    return out;
}

/** 和在场者有关的前情事件 */
export function eventsForCast(chatMeta, names = [], limit = 3) {
    const sum = readLwbSummary(chatMeta);
    if (!sum || !names.length) return [];
    const want = new Set(names.filter(Boolean));
    const picked = [];
    for (let i = sum.events.length - 1; i >= 0 && picked.length < limit; i--) {
        const e = sum.events[i];
        const people = (e?.participants ?? []).map(String);
        const hit = people.some(p => want.has(p) || [...want].some(n => p.includes(n) || n.includes(p)));
        if (!hit) continue;
        const bits = [
            String(e?.timeLabel ?? '').slice(0, 12),
            String(e?.title ?? '').slice(0, 16),
            String(e?.memoryRole ?? '').slice(0, 6),
            stripFloorTag(e?.summary).slice(0, 40),
        ].filter(Boolean);
        if (bits.length) picked.push(bits.join('｜'));
    }
    return picked.reverse();
}

/** 已总结到哪一楼（决定我们要不要让路/裁剪） */
export function summarizedBoundary(chatMeta) {
    return readLwbSummary(chatMeta)?.boundary ?? null;
}

/** 所有人名（characters.main），用于识别“该不该有新面孔” */
export function lwbCast(chatMeta) {
    const s = readLwbSummary(chatMeta);
    if (!s) return [];
    return s.chars.map(actorName).filter(Boolean);
}
