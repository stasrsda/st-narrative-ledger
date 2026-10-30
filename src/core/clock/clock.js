// 时钟：解析首行时间头、推进时长、渲染权威头
import {
    SHICHEN, DEFAULT_CAL, MIN_PER_DAY, MIN_PER_KE,
    fromParts, renderHeader, cnNum,
} from '../calendar/guofeng.js';

/** 时长枚举 → 分钟 */
export const DURATIONS = Object.freeze({
    instant: 0,
    quarter: 15,
    half_hour: 30,
    one_hour: 60,
    two_hour: 120,
    half_day: 720,
    night: 480,
    day: 1440,
});

/** 场景切换的强关键词：命中就不必问模型 */
const RULE_JUMPS = [
    [/次日|翌日|第二天|明日/, 'day'],
    [/隔日|数日后|三日后/, 'day'],
    [/当夜|是夜|夜里/, 'night'],
    [/半个时辰/, 'half_hour'],
    [/一个时辰/, 'two_hour'],
    [/一刻/, 'quarter'],
];

export function ruleDuration(text = '') {
    const s = String(text);
    for (const [re, key] of RULE_JUMPS) {
        if (re.test(s)) return key;
    }
    return null;
}

export function advance(t, key = 'instant') {
    const m = DURATIONS[key];
    if (m == null) return t;
    return t + m;
}

function parseShichenChar(ch) {
    const i = SHICHEN.indexOf(ch);
    return i < 0 ? null : i;
}

/**
 * 解析时间头片段：子正三刻 / 子时三刻 / 酉时正 / 酉时末 / 子时半 / 卯时
 * @returns {{shichen:number, ke:number}|null}
 */
export function parseTimeChunk(chunk = '') {
    const s = String(chunk).trim();
    const m = s.match(/([子丑寅卯辰巳午未申酉戌亥])时?([初正半末])?([一二三四五六七八1-8])?刻?/u);
    if (!m) return null;
    const shichen = parseShichenChar(m[1]);
    if (shichen == null) return null;
    const tail = m[2];
    const numRaw = m[3];
    const KE_LIST = ['一', '二', '三', '四', '五', '六', '七', '八'];
    const toInt = raw => (/[1-8]/.test(raw) ? Number(raw) : KE_LIST.indexOf(raw) + 1);
    let ke = null;
    if (numRaw) {
        const n = toInt(numRaw);
        // 「正三刻」= 第 7 刻；「初三刻」= 第 3 刻
        ke = tail === '正' ? 4 + n : n;
    }
    if (ke == null) {
        if (tail === '半') ke = 3;
        else if (tail === '末') ke = 7;
        else if (tail === '初') ke = 1;
        else if (tail === '正') ke = 5;
        else ke = 5;
    }
    return { shichen, ke: Math.max(1, Math.min(8, ke)) };
}

const CN = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

/** 汉字数字（1..99）→ 整数；纯阿拉伯数字直接返回 */
export function parseCnNumber(raw = '') {
    const s = String(raw).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);
    if (/^[零一二三四五六七八九]$/.test(s)) return s === '零' ? 0 : CN[s];
    const m = s.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
    if (!m) return null;
    const tens = m[1] ? CN[m[1]] : 1;
    const ones = m[2] ? CN[m[2]] : 0;
    return tens * 10 + ones;
}

/** 月：正/冬/腊/汉字/数字 */
export function parseCnMonth(raw = '') {
    const s = String(raw);
    if (s.includes('正')) return 1;
    if (s.includes('冬')) return 11;
    if (s.includes('腊')) return 12;
    const m = s.match(/([一二三四五六七八九十\d]+)/);
    return m ? parseCnNumber(m[1]) : null;
}

/** 日：初一 / 十五 / 二十 / 廿三 / 三十 / 23 */
export function parseCnDay(raw = '') {
    const s = String(raw).trim();
    if (/^\d+$/.test(s)) return Number(s);
    let m = s.match(/^初([一二三四五六七八九十])$/);
    if (m) return parseCnNumber(m[1]);
    m = s.match(/^廿([一二三四五六七八九])$/);
    if (m) return 20 + parseCnNumber(m[1]);
    m = s.match(/^[一二三]?十[一二三四五六七八九]?$/);
    if (m) return parseCnNumber(s);
    return parseCnNumber(s);
}

/**
 * 解析首行时间头。
 * 支持 『承平二十七年九月十四 · 子正三刻 · 雁回县·北门外五里』
 * 也支持没有书名号的同样结构。
 */
export function parseHeader(text = '', cal = DEFAULT_CAL) {
    let s = String(text).split('\n')[0].trim();
    const wrapped = s.match(/^[『「](.+)[』」]/u);
    if (wrapped) s = wrapped[1];
    const parts = s.split(/\s*[·・]\s*/).filter(Boolean);
    if (parts.length < 2) return null;

    const dateChunk = parts[0];
    const timeChunk = parts[1];
    const place = parts.slice(2).join('·');

    const yearM = dateChunk.match(/([零一二三四五六七八九十百\d]+)年/u);
    const monthM = dateChunk.match(/(正|冬|腊|[一二三四五六七八九十\d]+)月/u);
    const year = yearM ? parseCnNumber(yearM[1]) : 1;
    const month = monthM ? parseCnMonth(monthM[1]) : 1;
    // 日必须紧跟在「X月」之后，否则会误吞年份里的数字
    let day = null;
    if (monthM) {
        const rest = dateChunk.slice(monthM.index + monthM[0].length);
        const dayM = rest.match(/^(初[一二三四五六七八九十]|廿[一二三四五六七八九]|[一二三]?十[一二三四五六七八九]?|\d+)[日号]?/u);
        day = dayM ? parseCnDay(dayM[1]) : 1;
    }
    if (!year || !month || !day) return null;

    const tm = parseTimeChunk(timeChunk);
    if (!tm) return null;

    const t = fromParts({ year, month, day, shichen: tm.shichen, ke: tm.ke }, cal);
    return { t, place, raw: s };
}

/** 把时间头重写成权威值（保留天气段） */
export function rewriteHeader(text, t, place, cal = DEFAULT_CAL) {
    const lines = String(text).split('\n');
    const first = lines[0] ?? '';
    const m = first.match(/^[『「](.+)[』」]/u);
    let weather = '';
    if (m) {
        const segs = m[1].split(/\s*[·・]\s*/);
        if (segs.length >= 4) weather = segs.slice(3).join('·');
    }
    const head = renderHeader(t, [place, weather].filter(Boolean).join(' · '), cal);
    lines[0] = head;
    return lines.join('\n');
}

export { MIN_PER_DAY, MIN_PER_KE, renderHeader, cnNum };
