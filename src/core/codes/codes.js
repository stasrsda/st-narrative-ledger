// 礼法：候选过滤（代码）+ 命中渲染（注入）
function gateOk(code, household) {
    for (const g of code.gates ?? []) {
        if (g === 'hasMistress') {
            if (!household?.hasMistress) return false;
        } else if (g === 'hasMistress:false') {
            if (household?.hasMistress) return false;
        } else if (g === 'elders') {
            if (!household?.elders) return false;
        } else if (g === 'mourning') {
            if (!household?.mourning) return false;
        }
    }
    return true;
}

function whenOk(code, scene) {
    const when = code.when ?? [];
    if (!when.length) return true;
    return when.some(w => {
        if (w.startsWith('scene:')) return w.slice(6) === scene;
        return true;   // 非场景条件（辰时/夜 等）由调用方另行判断，这里放行
    });
}

function whoOk(code, rankIds) {
    const who = code.who ?? [];
    if (!who.length || who.includes('所有人')) return true;
    return who.some(w => rankIds.includes(w));
}

/**
 * 候选：给定场景与在场位份，能参与本轮判定的规则
 */
export function candidatesFor(pack, { scene = null, rankIds = [], household = {} } = {}) {
    const all = [
        ...(pack.codes?.rites ?? []).map(c => ({ ...c, kind: 'rite' })),
        ...(pack.codes?.house ?? []).map(c => ({ ...c, kind: 'house' })),
        ...(pack.codes?.laws ?? []).map(c => ({ ...c, kind: 'law' })),
        ...(pack.codes?.procedure ?? []).map(c => ({ ...c, kind: 'procedure' })),
    ];
    return all.filter(c => gateOk(c, household) && whenOk(c, scene) && whoOk(c, rankIds));
}

/** 注入行：[礼] 座次违制 —— 妾不得与正妃同席 */
export function renderHit(code) {
    if (!code) return '';
    const tag = { rite: '礼', house: '家法', law: '法', procedure: '程序' }[code.kind ?? (code.severity ? 'law' : 'rite')] ?? '礼';
    return `[${tag}] ${code.name}违制 —— ${(code.breach ?? []).slice(0, 2).join('、')}`;
}

/** 反应行：取 react 里最贴近当下的一档 */
export function renderReact(code, prefer = ['superior', 'peers', 'servants']) {
    if (!code?.react) return '';
    for (const k of [...prefer, ...Object.keys(code.react)]) {
        if (code.react[k]) return `[反应] ${code.react[k]}`;
    }
    return '';
}
