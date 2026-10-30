// B0 占位：账本只有一个空壳；折叠逻辑在 B1 实现。
export function createEmptyLedger() {
    return {
        version: 1,
        packId: null,
        seed: { t: 0, place: null, aff: {} },
        places: {},
        actors: {},
        props: {},
        items: {},
        household: { head: '王爷亲管', hasMistress: false, noblest: '无' },
        traces: [],
        threads: [],
        grants: [],
        econ: [],
        rep: 0,
    };
}

/** 空折叠：B1 换成真实实现 */
export function foldState(seed) {
    return { ...createEmptyLedger(), ...seed };
}
