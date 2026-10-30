// 古风历法：绝对分钟 t ⇄ 年月日 + 时辰刻
// t = 0 定义为「承平元年正月初一 子正一刻」（即第一日 00:00）

export const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const KE_CN = ['一', '二', '三', '四', '五', '六', '七', '八'];
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const MIN_PER_DAY = 1440;
export const MIN_PER_KE = 15;
export const KE_PER_SHICHEN = 8;

export const DEFAULT_CAL = Object.freeze({
    era: '承平',
    months: 12,
    monthDays: 30,
    yearFormat: '{era}{year}年',
    dayFormat: '{month}月{day}日',
});

/** 1..99 → 汉字 */
export function cnNum(n) {
    const v = Math.trunc(n);
    if (v < 10) return DIGITS[v];
    if (v < 20) return '十' + (v % 10 ? DIGITS[v % 10] : '');
    const tens = Math.floor(v / 10);
    const ones = v % 10;
    return DIGITS[tens] + '十' + (ones ? DIGITS[ones] : '');
}

export function dayIndex(t) {
    return Math.floor(t / MIN_PER_DAY);
}

export function minuteOfDay(t) {
    return ((t % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

/** 0=子 … 11=亥（子时跨 23:00–01:00） */
export function shichenIndex(t) {
    return Math.floor(((minuteOfDay(t) + 60) % MIN_PER_DAY) / 120);
}

/** 该时辰的起始分钟（0..1439） */
export function shichenStartMinute(idx) {
    return ((idx * 120 - 60) % MIN_PER_DAY + MIN_PER_DAY) % MIN_PER_DAY;
}

/** 时辰内的偏移分钟 0..119 */
export function offsetInShichen(t) {
    const start = shichenStartMinute(shichenIndex(t));
    return (minuteOfDay(t) - start + MIN_PER_DAY) % MIN_PER_DAY;
}

/** 刻 1..8（初 1-4，正 5-8） */
export function keOf(t) {
    return Math.floor(offsetInShichen(t) / MIN_PER_KE) + 1;
}

export function isZheng(t) {
    return keOf(t) >= 5;
}

/** t → { year, month, day }（一年 12 月，一月 30 日） */
export function toDate(t, cal = DEFAULT_CAL) {
    const d = dayIndex(t);
    const year = Math.floor(d / (cal.months * cal.monthDays)) + 1;
    const rest = d % (cal.months * cal.monthDays);
    const month = Math.floor(rest / cal.monthDays) + 1;
    const day = (rest % cal.monthDays) + 1;
    return { year, month, day };
}

/** { year, month, day } → 当日零点分钟 */
export function fromDate({ year = 1, month = 1, day = 1 }, cal = DEFAULT_CAL) {
    const d = (year - 1) * cal.months * cal.monthDays + (month - 1) * cal.monthDays + (day - 1);
    return d * MIN_PER_DAY;
}

/** 月/日/时辰/刻 → t */
export function fromParts({ year, month, day, shichen = 0, ke = 5 }, cal = DEFAULT_CAL) {
    const base = fromDate({ year, month, day }, cal);
    const start = shichenStartMinute(shichen);
    return base + start + (Math.max(1, Math.min(8, ke)) - 1) * MIN_PER_KE;
}

/** t → 子正三刻（初 1-4 刻，正 1-4 刻） */
export function renderTime(t) {
    const idx = shichenIndex(t);
    const ke = keOf(t);
    const n = ke <= 4 ? ke : ke - 4;
    return SHICHEN[idx] + (ke <= 4 ? '初' : '正') + KE_CN[n - 1] + '刻';
}

/** t → 承平十五年九月十四 */
export function renderMonth(m) {
    if (m === 1) return '正月';
    if (m === 11) return '冬月';
    if (m === 12) return '腊月';
    return cnNum(m) + '月';
}

export function renderDay(d) {
    if (d <= 10) return '初' + cnNum(d);
    if (d < 20) return '十' + cnNum(d - 10);
    if (d === 20) return '二十';
    if (d < 30) return '廿' + cnNum(d - 20);
    return '三十';
}

export function renderDate(t, cal = DEFAULT_CAL) {
    const { year, month, day } = toDate(t, cal);
    // 第一年称「元年」，这是年号纪年的写法
    const yearCn = year === 1 ? '元' : cnNum(year);
    return cal.yearFormat.replace('{era}', cal.era).replace('{year}', yearCn)
        + renderMonth(month) + renderDay(day);
}

/** t + 地点 → 『承平十五年九月十四 · 子正三刻 · 雁回县』 */
export function renderHeader(t, place = '', cal = DEFAULT_CAL) {
    const parts = [renderDate(t, cal), renderTime(t), place].filter(Boolean);
    return '『' + parts.join(' · ') + '』';
}
