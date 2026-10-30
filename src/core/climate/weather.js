// 天气：候选集由「季节 × 气候带」决定；挑选用种子，同一天稳定
import { hash32 } from '../place/tree.js';
import { dayIndex } from '../calendar/guofeng.js';
import { toDate } from '../calendar/guofeng.js';
import { seasonOf, calOf, zoneOf, SEASON_CN } from './season.js';

/** 候选天气（会去重、保序） */
export function candidates(zone, season) {
    const list = zone?.seasons?.[season] ?? [];
    return [...new Set(list)];
}

export function pick(list, seedStr) {
    if (!list.length) return null;
    return list[hash32(seedStr) % list.length];
}

/**
 * 当天天气
 * @returns {{word:string|null, zone:object|null, season:string, candidates:string[], stableSeed:string}}
 */
export function weatherFor({ pack, placeNode, t, chatSeed = '' }) {
    const zone = zoneOf(pack, placeNode);
    const cal = calOf(pack);
    const { month } = toDate(t, cal);
    const season = seasonOf(month, zone);
    const cands = candidates(zone, season);
    const day = dayIndex(t);
    const stableSeed = `${chatSeed}|${zone?.id ?? '-'}|${season}|${day}`;
    return { word: pick(cands, stableSeed), zone, season, candidates: cands, stableSeed, day };
}

/** 注入用短句：小雪·北风 · 冬 */
export function renderWeather(w, wind = '') {
    if (!w?.word) return '';
    const parts = [w.word];
    if (wind) parts.push(wind);
    const s = parts.join('·');
    return SEASON_CN[w.season] ? `${s} · ${SEASON_CN[w.season]}` : s;
}
