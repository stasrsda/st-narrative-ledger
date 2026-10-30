// 节令：按 月/日 查，并给出「今天」「最近」两种提示
import { toDate, fromDate, MIN_PER_DAY, cnNum } from '../calendar/guofeng.js';
import { calOf } from './season.js';

/** 当天的节令（0 或 1 条） */
export function festivalOn(pack, t) {
    const cal = calOf(pack);
    const { month, day } = toDate(t, cal);
    return (pack?.festivals ?? []).find(f => f.month === month && f.day === day) ?? null;
}

/** 从今天起 within 天内最近的节令（含今天） */
export function nextFestival(pack, t, within = 30) {
    const cal = calOf(pack);
    const list = pack?.festivals ?? [];
    const today = dayIndexLocal(t, cal);
    let best = null;
    for (const f of list) {
        const base = fromDate({ year: toDate(t, cal).year, month: f.month, day: f.day }, cal);
        let diff = Math.round((base - t) / MIN_PER_DAY);
        if (diff < 0) diff += cal.months * cal.monthDays;   // 明年
        if (diff <= within && (!best || diff < best.days)) {
            best = { ...f, days: diff, t: base };
        }
    }
    return best;
}

function dayIndexLocal(t, cal) {
    return Math.floor(t / MIN_PER_DAY);
}

/** 节令注入片段：腊八（明日） */
export function renderFestival(f) {
    if (!f) return '';
    const when = f.days === 0 ? '今日' : f.days === 1 ? '明日' : `${cnNum(f.days)}日后`;
    return `${f.name}（${when}）`;
}

/** 组合：天气 + 节令，一行 */
export function sceneLine({ weather, festival }) {
    const bits = [];
    if (weather) bits.push(`天:${weather}`);
    if (festival) bits.push(`节:${festival}`);
    return bits.join(' | ');
}
