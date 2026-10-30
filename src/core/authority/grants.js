// 职权：能不能办这件事
const ORDER = ['view', 'act', 'delegate'];

function rightSatisfies(held, want) {
    if (held === want) return true;
    if (want === 'view') return held === 'act' || held === 'delegate';
    if (want === 'act') return held === 'delegate';
    return false;
}

function scopeMatches(grantScope, want) {
    return grantScope === want || grantScope === '*';
}

/**
 * @param {Array} grants [{holder, scope, rights, source}]
 */
export function can(grants = [], holder, scope, right = 'view') {
    return grants.some(g =>
        g.holder === holder
        && scopeMatches(g.scope, scope)
        && (g.rights ?? []).some(r => rightSatisfies(r, right)));
}

/** 谁有这项权 */
export function whoCan(grants = [], scope, right = 'view') {
    const out = new Set();
    for (const g of grants) {
        if (scopeMatches(g.scope, scope) && (g.rights ?? []).some(r => rightSatisfies(r, right))) {
            out.add(g.holder);
        }
    }
    return [...out];
}

export function grant(grants = [], g) {
    const rest = grants.filter(x => !(x.holder === g.holder && x.scope === g.scope));
    return [...rest, {
        holder: g.holder,
        scope: g.scope,
        rights: [...new Set(g.rights ?? ['view'])],
        source: g.source ?? 'appoint',
    }];
}

export function revoke(grants = [], holder, scope) {
    return grants.filter(x => !(x.holder === holder && x.scope === scope));
}

/** 知微 掌账目（查看·处置） */
export function grantLine(g) {
    const rights = (g.rights ?? []).slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return `${g.holder} ${scopeCn(g.scope)}（${rights.map(rightCn).join('·')}）`;
}

function scopeCn(s) {
    return s.startsWith('p_') ? '本院' : ({
        household: '内宅', ledger: '账目', storehouse: '库房', staff: '人事',
        protocol: '外事', army: '军务', dispatch: '文书', investigate: '查案',
        darkguard: '暗卫',
    }[s] ?? s);
}

function rightCn(r) {
    return ({ view: '查看', act: '处置', delegate: '转授', represent: '代表' }[r] ?? r);
}

/** 处置前先问：这件事归谁办 */
export function dispatchHint(grants, scope, actorId) {
    if (can(grants, actorId, scope, 'act')) return '可自行处置';
    if (can(grants, actorId, scope, 'view')) return '只能查看，不能拍板';
    return '须请示';
}
