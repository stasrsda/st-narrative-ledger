// 经验：三根轴——累计次数、与主角次数、间隔。名分管能不能，动机管为什么，经验管怎么做。
import { MIN_PER_DAY } from '../calendar/guofeng.js';

function pick(ladder = [], n = 0) {
    let hit = ladder[0] ?? null;
    for (const l of ladder) {
        if (n >= l.min) hit = l;
    }
    return hit;
}

/** 身体熟练度：未经 / 初经 / 渐熟 / 熟 / 老夫老妻 */
export function levelOf(pack, total = 0) {
    return pick(pack?.experience?.ladder ?? [], Math.max(0, total));
}

/** 与主角之间的节奏 */
export function bondOf(pack, withUser = 0) {
    return pick(pack?.experience?.bond ?? [], Math.max(0, withUser));
}

/** 器官层面的状态词（作者写在世界包里，代码只选档） */
export function physicalOf(pack, total = 0) {
    return levelOf(pack, total)?.physical ?? '';
}

/**
 * 间隔：多久没做过。久疏会回到接近初次的紧度，与累计次数无关。
 * @returns {{label:string, note:string, days:number}|null}
 */
export function recentOf(pack, exp = {}, nowT = null) {
    const list = pack?.experience?.recent ?? [];
    if (!list.length) return null;
    const last = exp?.lastT;
    if (last == null || nowT == null) return { ...list[list.length - 1], days: null };
    const days = Math.max(0, Math.floor((nowT - last) / MIN_PER_DAY));
    const hit = list.find(x => days <= x.maxDays) ?? list[list.length - 1];
    return { ...hit, days };
}

export function blankExp() {
    return { total: 0, withUser: 0, lastT: null };
}

export function expOf(state, actorId) {
    return state?.exp?.[actorId] ?? blankExp();
}

export function bumpExp(exp, t = null) {
    const e = { ...blankExp(), ...(exp ?? {}) };
    return { total: e.total + 1, withUser: e.withUser + 1, lastT: t };
}

/** 单场阶段：未起 / 前戏 / 交合 / 临界 / 事后（不改变累计档位，只管当下） */
export function phaseOf(pack, id = 'none') {
    const list = pack?.experience?.phases ?? [];
    return list.find(x => x.id === id) ?? list[0] ?? null;
}

/** 阶段过期：隔了一天就回到未起 */
export function phaseAlive(pack, phaseState, nowT) {
    if (!phaseState?.id || phaseState.id === 'none') return false;
    if (nowT == null || phaseState.t == null) return true;
    return (nowT - phaseState.t) < MIN_PER_DAY;
}

/**
 * 注入行：[经验] 知微 渐熟｜身体:…｜与你:5 次｜此刻:交合——潮热，内里一阵阵收
 * 只在亲密相关时用
 */
export function expLine(pack, actorName, exp = blankExp(), nowT = null, phaseState = null) {
    const body = levelOf(pack, exp.total);
    if (!body) return '';
    const alive = phaseAlive(pack, phaseState, nowT);
    const ph = alive ? phaseOf(pack, phaseState.id) : null;

    // 有当前阶段时只给「档位 + 此刻」：阶段是本轮最要紧的，其余是背景，不重复占预算
    if (ph?.body) {
        return `[经验] ${actorName} ${body.label}｜此刻:${ph.label}——${ph.body}`;
    }

    const bits = [];
    if (body.physical) bits.push(`身体:${body.physical}`);
    if (exp.withUser > 0) bits.push(`与你:${exp.withUser} 次`);
    const bond = bondOf(pack, exp.withUser);
    if (bond?.note) bits.push(bond.note);
    const recent = exp.total > 0 ? recentOf(pack, exp, nowT) : null;
    if (recent?.label && recent.days != null) {
        const when = recent.days === 0 ? '今日' : recent.days === 1 ? '昨日' : `${recent.days} 日`;
        bits.push(`${recent.label}（${when}）`);
    }
    return `[经验] ${actorName} ${body.label}｜${bits.join('｜')}`;
}

export function shouldInjectExp({ intimate = false, mentioned = false } = {}) {
    return Boolean(intimate || mentioned);
}
