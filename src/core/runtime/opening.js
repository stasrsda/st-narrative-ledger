// 开局状态：人还在雁回县外
import { fromParts } from '../calendar/guofeng.js';

/** 承平十六年九月十四 · 酉初三刻 · 北门外五里 */
export const OPENING_TIME = Object.freeze({ year: 16, month: 9, day: 14, shichen: 9, ke: 3 });

/** 开场在场：只有霍振。知微还在牢里，不算在场。 */
export const OPENING_ONSTAGE = Object.freeze(['huozhen']);

export const OPENING_AFF = Object.freeze({
    zhiwei: -30,
    huozhen: 60,
    song: 40,
    zhaobo: 70,
    xie: 0,
    qingyun: 0,
});

export const OPENING_RANK = Object.freeze({ zhiwei: '囚', xie: '待嫁' });

/**
 * 生成开局 seed（供 chat_metadata.storyLedger.seed）
 * @param {object} pack
 */
export function openingSeed(pack, overrides = {}) {
    const time = overrides.time ?? OPENING_TIME;
    const t = fromParts(time, {
        era: pack?.calendar?.era ?? '承平',
        months: 12,
        monthDays: pack?.calendar?.monthDays ?? 30,
        yearFormat: '{era}{year}年',
    });
    return {
        t,
        place: overrides.place ?? 'p_wuli',
        aff: { ...OPENING_AFF, ...(overrides.aff ?? {}) },
        rank: { ...OPENING_RANK, ...(overrides.rank ?? {}) },
        exp: { ...(overrides.exp ?? {}) },
        done: ['e_break_city'],   // 城已经破了，他还在城外
        emergent: [],
        traces: [],
        grants: [],
        items: {},
        props: {},
        rep: 0,
    };
}

export function openingMeta(pack, overrides = {}) {
    const seed = openingSeed(pack, overrides);
    return {
        seed,
        placeId: seed.place,
        placeName: overrides.placeName ?? '北门外五里',
        onstage: overrides.onstage ?? [...OPENING_ONSTAGE],
        lastT: seed.t,
        resetAt: Date.now(),
    };
}
