// 组装 [状态] 块（纯函数，可单测）
import { renderDate, renderTime } from '../calendar/guofeng.js';
import { bandOf } from '../affinity/affinity.js';

const DROP_ORDER = ['items', 'props', 'color', 'travel', 'stipend', 'price', 'auth', 'exp', 'festival', 'weather', 'motive', 'events'];

export function estimateTokens(text) {
    // 中文约 1.5 字/token，保守取 1.4
    return Math.ceil(String(text).length / 1.4);
}

function onstageLine(pack, onstage = [], showNumbers = true) {
    const parts = onstage.slice(0, 6).map(a => {
        const aff = a.aff ?? 0;
        const band = bandOf(pack, aff, a.bond ?? 'love').name;
        const addr = a.address ? `/称"${a.address}"` : '';
        return showNumbers ? `${a.name}(${aff}/${band}${addr})` : `${a.name}(${band}${addr})`;
    });
    return parts.length ? `在场:${parts.join(' ')}` : '';
}

/**
 * @param {object} o
 * @param {object} o.pack 世界包
 * @param {object} o.state {t, place}
 * @param {string} o.placePath 雁回县>北门外五里
 * @param {string} [o.weather] 阴·北风 · 秋
 * @param {string} [o.festival] 腊八（明日）
 * @param {Array} [o.onstage] [{name, aff, address}]
 * @param {string} [o.motive] 知微 -10 屈从/交易
 * @param {Array<string>} [o.auth] ['知微 账目（查看·处置）']
 * @param {string} [o.events] 未结：…｜已结：…
 * @param {string} [o.props] [陈设] …
 * @param {string} [o.items] [物] …
 * @param {number} [o.budget] 预算 token
 */
export function composeSceneBlock(o = {}) {
    const { pack, state = {}, budget = 220 } = o;
    const parts = [];
    const t = state.t ?? 0;

    const head = `时:${renderDate(t)}·${renderTime(t)}${o.placePath ? ` | 地:${o.placePath}` : ''}`;
    parts.push({ key: 'header', text: head, locked: true });

    if (o.weather) parts.push({ key: 'weather', text: `天:${o.weather}` });
    if (o.festival) parts.push({ key: 'festival', text: `节:${o.festival}` });

    const on = onstageLine(pack, o.onstage ?? [], o.showAffNumbers !== false);
    if (on) parts.push({ key: 'onstage', text: on, locked: true });

    if (o.motive) parts.push({ key: 'motive', text: `动机:${o.motive}` });
    if (o.exp) parts.push({ key: 'exp', text: o.exp });
    for (const a of o.auth ?? []) parts.push({ key: 'auth', text: `权:${a}` });
    if (o.events) parts.push({ key: 'events', text: `事件:${o.events}` });
    for (const t of o.tables ?? []) parts.push({ key: t.key, text: t.text });
    if (o.props) parts.push({ key: 'props', text: o.props });
    if (o.items) parts.push({ key: 'items', text: o.items });

    parts.push({ key: 'footer', text: '与<info>冲突时以本块为准。', locked: true });

    const dropped = [];
    let text = assemble(parts);
    while (estimateTokens(text) > budget) {
        const victim = DROP_ORDER.find(k => parts.some(p => p.key === k));
        if (!victim) break;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].key === victim) parts.splice(i, 1);
        }
        dropped.push(victim);
        text = assemble(parts);
    }
    return { text, parts, tokens: estimateTokens(text), dropped };
}

function assemble(parts) {
    const body = parts.map(p => p.text).join('\n');
    return `[状态·只读·勿复述]\n${body}`;
}
