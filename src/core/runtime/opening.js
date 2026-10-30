// 开局状态：由世界包的 opening 段决定，不再写死在代码里
import { fromParts } from '../calendar/guofeng.js';

/** 包里没写 opening 时的兜底：承平元年正月初一 · 午初一刻 */
const FALLBACK = Object.freeze({
    time: { year: 1, month: 1, day: 1, shichen: 6, ke: 1 },
    place: null,
    placeName: '',
    onstage: [],
    aff: {},
    rank: {},
    done: [],
    label: '',
});

/** 读包里 opening，缺的项用兜底 */
export function openingOf(pack) {
    const o = pack?.opening ?? {};
    const era = pack?.calendar?.era ?? '承平';
    const t = o.time ?? FALLBACK.time;
    return {
        time: t,
        place: o.place ?? FALLBACK.place,
        placeName: o.placeName ?? FALLBACK.placeName,
        onstage: [...(o.onstage ?? FALLBACK.onstage)],
        aff: { ...(o.aff ?? {}) },
        rank: { ...(o.rank ?? {}) },
        done: [...(o.done ?? FALLBACK.done)],
        label: o.label ?? '',
        era,
    };
}

/** 下拉/按钮上显示的开局说明 */
export function openingLabel(pack) {
    const o = openingOf(pack);
    if (o.label) return o.label;
    const bits = [`${o.era}${o.time.year}年`];
    if (o.placeName) bits.push(o.placeName);
    return bits.join(' · ');
}

/**
 * 生成开局 seed（供 chat_metadata.storyLedger.seed）
 * @param {object} pack
 */
export function openingSeed(pack, overrides = {}) {
    const o = openingOf(pack);
    const time = overrides.time ?? o.time;
    const t = fromParts(time, {
        era: o.era,
        months: 12,
        monthDays: pack?.calendar?.monthDays ?? 30,
        yearFormat: '{era}{year}年',
    });
    return {
        t,
        place: overrides.place ?? o.place,
        aff: { ...o.aff, ...(overrides.aff ?? {}) },
        rank: { ...o.rank, ...(overrides.rank ?? {}) },
        exp: { ...(overrides.exp ?? {}) },
        done: [...(overrides.done ?? o.done)],
        emergent: [],
        traces: [],
        grants: [...(pack?.authority?.seed ?? [])],
        items: {},
        props: {},
        rep: 0,
    };
}

export function openingMeta(pack, overrides = {}) {
    const o = openingOf(pack);
    const seed = openingSeed(pack, overrides);
    return {
        seed,
        placeId: seed.place,
        placeName: overrides.placeName ?? o.placeName,
        onstage: overrides.onstage ?? [...o.onstage],
        label: overrides.label ?? openingLabel(pack),
        lastT: seed.t,
        resetAt: Date.now(),
    };
}
