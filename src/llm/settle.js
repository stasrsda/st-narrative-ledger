// 结算结果 → 事件数组（纯函数）
import { deltaFor } from '../core/affinity/affinity.js';

/**
 * @param {object} pack
 * @param {object} state 当前折叠状态（用来去重）
 * @param {object} data normalizeSettle 的输出
 * @returns {Array} 事件数组
 */
export function toEvents(pack, state, data = {}) {
    const events = [];
    const actorIds = new Set(Object.keys(pack.index?.actor ?? {}));
    const seenEmergent = new Set((state.emergent ?? []).map(e => e.quote || e.name));
    const doneIds = new Set(state.done ?? []);

    for (const r of data.results ?? []) {
        if (!actorIds.has(r.actor)) continue;
        const delta = deltaFor(pack, r.kind);
        if (!delta) continue;
        events.push({ k: 'aff', actor: r.actor, delta, kind: r.kind, note: r.note ?? '' });
    }

    for (const b of data.beats ?? []) {
        if (!actorIds.has(b.actor)) continue;
        const beat = (pack.index?.actor?.[b.actor]?.beats ?? []).find(x => x.id === b.id);
        if (!beat) continue;
        if (beat.once && doneIds.has(`beat:${b.actor}:${b.id}`)) continue;
        events.push({ k: 'event', id: `beat:${b.actor}:${b.id}`, source: 'beat' });
    }

    for (const c of data.codeHits ?? []) {
        if (!pack.index?.code?.[c.id]) continue;
        events.push({ k: 'trace', code: c.id, kind: c.kind });
    }

    for (const h of data.happened ?? []) {
        const key = h.quote || h.name;
        if (seenEmergent.has(key)) continue;
        seenEmergent.add(key);
        events.push({ k: 'emergent', name: h.name, quote: h.quote ?? '' });
    }

    for (const k of data.knows ?? []) {
        if (!actorIds.has(k.actor)) continue;
        events.push({ k: 'know', actor: k.actor, fact: k.fact, state: 'know' });
    }

    return events;
}
