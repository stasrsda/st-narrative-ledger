// 事件溯源：state(n) = fold(seed, events[0..n])
export function emptyState() {
    return {
        t: 0,
        place: null,
        aff: {},
        rank: {},
        know: {},
        done: [],
        emergent: [],
        traces: [],
        threads: [],
        grants: [],
        props: {},
        items: {},
        econ: [],
        rep: 0,
        household: { head: '王爷亲管', hasMistress: false, noblest: '无' },
    };
}

function clone(s) {
    return {
        ...s,
        aff: { ...s.aff },
        rank: { ...s.rank },
        know: { ...s.know },
        done: [...s.done],
        emergent: [...s.emergent],
        traces: [...s.traces],
        threads: [...s.threads],
        grants: [...s.grants],
        props: { ...s.props },
        items: { ...s.items },
        econ: [...s.econ],
        household: { ...s.household },
    };
}

/** 单条事件 → 新状态（不改原对象） */
export function applyEvent(state, ev, opts = {}) {
    if (!ev || typeof ev !== 'object') return state;
    const s = clone(state);
    switch (ev.k) {
        case 'clock':
            if (Number.isFinite(ev.t)) s.t = ev.t;
            break;
        case 'move':
            if (ev.actor === 'user') s.place = ev.place;
            break;
        case 'aff': {
            const lo = opts.affMin ?? -100;
            const hi = opts.affMax ?? 100;
            const cur = s.aff[ev.actor] ?? 0;
            const next = cur + (Number(ev.delta) || 0);
            s.aff[ev.actor] = Math.max(lo, Math.min(hi, next));
            break;
        }
        case 'rank':
            if (ev.actor && ev.to) s.rank[ev.actor] = ev.to;
            break;
        case 'know':
            if (ev.actor && ev.fact) s.know[ev.actor] = { ...(s.know[ev.actor] || {}), [ev.fact]: ev.state ?? 'know' };
            break;
        case 'event':
            if (ev.id && !s.done.includes(ev.id)) s.done.push(ev.id);
            break;
        case 'emergent':
            if (ev.name) s.emergent.push({ name: ev.name, quote: ev.quote ?? '', floor: ev.floor ?? -1 });
            break;
        case 'trace':
            s.traces.push({ code: ev.code, kind: ev.kind, floor: ev.floor ?? -1, witnesses: ev.witnesses ?? [] });
            break;
        case 'grant':
            s.grants.push({ holder: ev.holder, scope: ev.scope, rights: ev.rights ?? [], source: ev.source ?? 'appoint' });
            break;
        case 'revoke':
            s.grants = s.grants.filter(g => !(g.holder === ev.holder && g.scope === ev.scope));
            break;
        case 'econ':
            if (ev.driver) s.econ.push({ driver: ev.driver, since: ev.since ?? s.t });
            break;
        case 'econ_end':
            s.econ = s.econ.filter(x => x.driver !== ev.driver);
            break;
        default:
            break;
    }
    return s;
}

/**
 * 折叠：eventsByFloor 为按楼层升序的数组，每项是该楼的事件数组。
 * 只折叠到 uptoFloor（含）；不传则全部。
 */
export function fold(seed, eventsByFloor, { uptoFloor = Infinity, affMin, affMax } = {}) {
    let s = { ...emptyState(), ...seed };
    for (const { floor, events } of eventsByFloor) {
        if (floor > uptoFloor) break;
        for (const ev of events ?? []) {
            s = applyEvent(s, ev, { affMin, affMax });
        }
    }
    return s;
}

/** 重生成/滑动：丢掉该楼及之后的事件再折叠 */
export function foldAfterRollback(seed, eventsByFloor, floor, opts = {}) {
    return fold(seed, eventsByFloor, { ...opts, uptoFloor: floor - 1 });
}

export { clone };
