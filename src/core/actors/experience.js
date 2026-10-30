// 经验：第三根轴。名分管能不能，动机管为什么，经验管怎么做。
function pick(ladder = [], n = 0) {
    let hit = ladder[0] ?? null;
    for (const l of ladder) {
        if (n >= l.min) hit = l;
    }
    return hit;
}

/** 身体熟练度 0..20+ → 未经/初经/渐熟/熟/老夫老妻 */
export function levelOf(pack, total = 0) {
    return pick(pack?.experience?.ladder ?? [], Math.max(0, total));
}

/** 与主角之间的节奏 */
export function bondOf(pack, withUser = 0) {
    return pick(pack?.experience?.bond ?? [], Math.max(0, withUser));
}

export function blankExp() {
    return { total: 0, withUser: 0, lastT: null };
}

export function expOf(state, actorId) {
    return state?.exp?.[actorId] ?? blankExp();
}

/** 记一次（同楼重生成靠事件流幂等，不在这里去重） */
export function bumpExp(exp, t = null) {
    const e = { ...blankExp(), ...(exp ?? {}) };
    return { total: e.total + 1, withUser: e.withUser + 1, lastT: t };
}

/**
 * 注入行：[经验] 知微 初经｜身体:生｜与你:2 次｜问得多
 * 只在场、且场景相关时才该用
 */
export function expLine(pack, actorName, exp = blankExp()) {
    const body = levelOf(pack, exp.total);
    const bond = bondOf(pack, exp.withUser);
    if (!body) return '';
    const bits = [`身体:${body.label}`];
    if (exp.withUser > 0) bits.push(`与你:${exp.withUser} 次`);
    if (bond && bond.note) bits.push(bond.note);
    return `[经验] ${actorName} ${body.label}｜${bits.join('｜')}｜${body.voice}`;
}

/** 该不该注入：只在亲密场景或有人提起时 */
export function shouldInjectExp({ intimate = false, mentioned = false } = {}) {
    return Boolean(intimate || mentioned);
}
