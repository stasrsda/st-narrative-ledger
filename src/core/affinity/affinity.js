// 好感：档位、事件表、夹取与上限
export const KINDS = Object.freeze({ A: '小恩', B: '中恩', C: '大恩', D: '关键', E: '背叛', F: '无' });

export function deltaFor(pack, kind) {
    const table = pack?.affinity?.events ?? { A: 5, B: 10, C: 20, D: 30, E: -40 };
    return table[kind] ?? 0;
}

/** 档位：每 step 分一档；bond 决定用哪套词（love/loyalty/kin） */
export function bandOf(pack, value, bond = 'love') {
    const min = pack.affinity.min;
    const max = pack.affinity.max;
    const step = pack.affinity.step ?? 10;
    const ladder = (bond && bond !== 'love' ? pack.affinity[bond] : null) ?? pack.affinity.ladder ?? [];
    const v = Math.max(min, Math.min(max, value));
    const idx = Math.max(0, Math.min(ladder.length - 1, Math.floor((v - min) / step)));
    return { index: idx, name: ladder[idx] ?? '', value: v };
}

/**
 * 记一笔好感
 * @param {number} current
 * @param {string} kind A..F
 * @param {{arcSpent?:number, capPerArc?:number, maxPerRound?:number}} o
 * @returns {{value:number, raw:number, delta:number, capped:boolean, reason:string}}
 */
export function applyKind(pack, current, kind, o = {}) {
    const maxPerRound = o.maxPerRound ?? pack.affinity.maxPerRound ?? 30;
    const capPerArc = o.capPerArc ?? pack.affinity.capPerArc ?? 80;
    const arcSpent = o.arcSpent ?? 0;
    const raw = deltaFor(pack, kind);
    let delta = raw;
    const reasons = [];

    if (Math.abs(delta) > maxPerRound) {
        delta = Math.sign(delta) * maxPerRound;
        reasons.push('单轮上限');
    }
    const spent = Math.max(0, arcSpent);
    if (spent + Math.abs(delta) > capPerArc) {
        const room = Math.max(0, capPerArc - spent);
        delta = Math.sign(delta) * room;
        reasons.push('单幕上限');
    }
    const next = current + delta;
    const min = pack.affinity.min;
    const max = pack.affinity.max;
    const clamped = Math.max(min, Math.min(max, next));
    if (clamped !== next) reasons.push('区间夹取');

    return { value: clamped, raw, delta, capped: reasons.length > 0, reason: reasons.join('/') };
}

/** −30 → 怕 */
export function affLine(pack, value, bond = 'love') {
    const b = bandOf(pack, value, bond);
    return `${b.value} ${b.name}`;
}
