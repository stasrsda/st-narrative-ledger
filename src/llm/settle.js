// 结算结果 → 事件数组（纯函数）
import { deltaFor } from '../core/affinity/affinity.js';
import { codeAllowedAt } from '../core/codes/gate.js';

/**
 * @param {object} pack
 * @param {object} state 当前折叠状态（用来去重）
 * @param {object} data normalizeSettle 的输出
 * @returns {Array} 事件数组
 */
export function toEvents(pack, state, data = {}, opts = {}) {
    const events = [];
    const actorIds = new Set(Object.keys(pack.index?.actor ?? {}));
    // 玩家角色不参与好感（没有「对自己好感」这回事）
    const selfIds = new Set(
        Object.values(pack.index?.actor ?? {}).filter(a => a?.isUser).map(a => a.id),
    );
    const seenEmergent = new Set((state.emergent ?? []).map(e => e.quote || e.name));
    const doneIds = new Set(state.done ?? []);

    // 单轮上限：同一个人这一轮的正向加分不能超过 pack.affinity.maxPerRound
    const cap = Number(pack?.affinity?.maxPerRound ?? 0) || Infinity;
    const gained = new Map();
    for (const r of data.results ?? []) {
        if (!actorIds.has(r.actor)) continue;
        if (selfIds.has(r.actor)) continue;
        const delta = deltaFor(pack, r.kind);
        if (!delta) continue;
        let d = delta;
        if (d > 0) {
            const used = gained.get(r.actor) ?? 0;
            const room = cap - used;
            if (room <= 0) {
                events.push({ k: 'aff', actor: r.actor, delta: 0, kind: 'F', note: '超出单轮上限', src: 'settle' });
                continue;
            }
            d = Math.min(d, room);
            gained.set(r.actor, used + d);
        }
        events.push({ k: 'aff', actor: r.actor, delta: d, kind: r.kind, note: r.note ?? '', src: 'settle' });
    }

    for (const b of data.beats ?? []) {
        if (!actorIds.has(b.actor)) continue;
        const beat = (pack.index?.actor?.[b.actor]?.beats ?? []).find(x => x.id === b.id);
        if (!beat) continue;
        if (beat.once && doneIds.has(`beat:${b.actor}:${b.id}`)) continue;
        events.push({ k: 'event', id: `beat:${b.actor}:${b.id}`, source: 'beat', src: 'settle' });
    }

    for (const c of data.codeHits ?? []) {
        if (!pack.index?.code?.[c.id]) continue;
        // 场景门：夜访只在卧房，问案只在公堂/牢房
        if (!codeAllowedAt(pack.index.code[c.id], opts.scene ?? null)) continue;
        events.push({ k: 'trace', code: c.id, kind: c.kind, src: 'settle' });
    }

    for (const h of data.happened ?? []) {
        const key = h.quote || h.name;
        if (seenEmergent.has(key)) continue;
        seenEmergent.add(key);
        events.push({ k: 'emergent', name: h.name, quote: h.quote ?? '', src: 'settle' });
    }

    for (const it of data.intimate ?? []) {
        if (!actorIds.has(it.actor)) continue;
        events.push({ k: 'exp', actor: it.actor, phase: it.phase, src: 'settle' });
    }

    for (const k of data.knows ?? []) {
        if (!actorIds.has(k.actor)) continue;
        events.push({ k: 'know', actor: k.actor, fact: k.fact, state: 'know', src: 'settle' });
    }

    return events;
}
