// 时钟由插件推进：写作模型不决定时间，只读注入的结果
import { DURATIONS, ruleDuration, advance } from './clock.js';

/** 兜底：一轮对话默认占用多久（分钟） */
export const DEFAULT_TURN_MINUTES = 30;

/** 场景类型 → 常见耗时（分钟），按顺序匹配 */
const SCENE_HINTS = [
    [/(审讯|拷问|堂审|过堂|问案|审了|问了半天|交代)/, 60],
    [/(赶路|行军|奔袭|骑行|出城|入城|上路)/, 720],
    [/(议事|军议|朝会|点卯|训话)/, 60],
    [/(用饭|吃酒|饮茶|饭食|宴)/, 45],
    [/(沐浴|梳洗|更衣|换药|疗伤)/, 30],
    [/(睡|歇息|就寝|宿|过夜)/, 480],
    [/(写|抄|翻|读|看|阅)/, 30],
];

/**
 * 这一轮过了多久。
 * 1) 文本里有明确时间跳转（次日/一个时辰/一刻…）→ 用那条
 * 2) 命中场景类型 → 用该类型的常见耗时
 * 3) 都没有 → 默认半小时
 */
export function turnMinutes(text = '') {
    const kicker = ruleDuration(text);
    if (kicker) {
        const m = DURATIONS[kicker];
        const label = { day: '一天', night: '一夜', half_hour: '半个时辰', two_hour: '一个时辰', quarter: '一刻' }[kicker] ?? kicker;
        if (Number.isFinite(m)) return { minutes: m, why: `文中提到${label}` };
    }
    for (const [re, min] of SCENE_HINTS) {
        if (re.test(text)) return { minutes: min, why: '场景类型' };
    }
    return { minutes: DEFAULT_TURN_MINUTES, why: '默认一轮' };
}

/** 生成推进后的绝对时间 */
export function advanceTurn(t, text = '', { scale = 1 } = {}) {
    const r = turnMinutes(text);
    const minutes = Math.round(r.minutes * scale);
    return { t: advance(t, 'instant') + minutes, minutes, why: r.why };
}

/** 一行说明，给面板看 */
export function renderAdvance(minutes, why) {
    if (!minutes) return '0 分';
    if (minutes >= 1440) return `${Math.round(minutes / 1440)} 天（${why}）`;
    if (minutes >= 60) return `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} 小时（${why}）`;
    return `${minutes} 分钟（${why}）`;
}
