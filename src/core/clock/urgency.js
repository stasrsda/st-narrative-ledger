// 时间的紧迫度：离天亮/天黑还有多久，给副模型判断这一场能放多少事
import { minuteOfDay } from '../calendar/guofeng.js';

const DAWN_MIN = 5 * 60 + 0;   // 卯初 ≈ 05:00
const DUSK_MIN = 17 * 60 + 30; // 酉正 ≈ 17:30

function humanSpan(min) {
    if (min <= 0) return '就是现在';
    if (min < 30) return `${Math.max(1, Math.round(min))} 分钟`;
    if (min < 120) return `${Math.max(1, Math.round(min / 15))} 刻`;
    const shi = min / 120;                 // 一个时辰 = 120 分钟
    if (shi < 1) return '一个时辰不到';
    if (shi < 2) return '一个多时辰';
    return `${Math.round(shi)} 个时辰`;
}

/**
 * @returns {{text:string, minutes:number, kind:'dawn'|'dusk'|''}}
 */
export function urgencyAt(t) {
    const m = minuteOfDay(t);
    let kind = '';
    let target = 0;
    if (m < DAWN_MIN) { kind = 'dawn'; target = DAWN_MIN; }
    else if (m < DUSK_MIN) { kind = 'dusk'; target = DUSK_MIN; }
    else { kind = 'dawn'; target = DAWN_MIN + 1440; }
    const minutes = target - m;
    const label = kind === 'dawn' ? '天亮' : '天黑';
    return { text: `距${label}还有${humanSpan(minutes)}`, minutes, kind };
}

/** 渲染成一行，给副模型和状态块用 */
export function urgencyLine(t) {
    const u = urgencyAt(t);
    return u.text;
}
