// 礼法检索：按场景、位份、正文关键词打分，只把最相关的几条交给副模型
/**
 * 打分来源：
 *  +4  正文里出现这条规则的名称/违制词
 *  +3  when 里的 scene 与当前场景一致
 *  +2  who 包含在场位份
 *  +2  与场景主类匹配（court/prison → 律与程序；inner_court → 礼与家法…）
 *  +1  when 是「任何场合」
 *  -3  最近三幕已经命中过（避免反复报同一条）
 */
const SCENE_KIND = {
    court: ['law', 'procedure'],
    prison: ['procedure', 'law'],
    inner_court: ['rite', 'house'],
    bedroom: ['rite', 'house'],
    hall: ['rite', 'house'],
    banquet: ['rite'],
    garden: ['rite'],
    palace: ['clan', 'rite'],
    camp: ['law', 'house'],
    gate: ['law', 'house'],
    market: ['law'],
    street: ['law', 'rite'],
    roadside: ['law', 'procedure'],
    grassland: ['law'],
    temple: ['rite'],
    study: ['house', 'rite'],
    storehouse: ['house', 'law'],
    kitchen: ['house'],
    stable: ['house'],
};

function textHits(code, text) {
    const t = String(text ?? '');
    if (!t) return 0;
    let n = 0;
    const words = [code.name, ...(code.syn ?? []), ...(code.breach ?? [])];
    for (const w of words) {
        if (!w || w.length < 2) continue;
        // 取词的前两字，命中即算（「座次违制」→「座次」）
        const key = w.slice(0, 2);
        if (t.includes(key)) n++;
    }
    return n > 0 ? 4 : 0;
}

/**
 * @returns {Array<{code:object, score:number}>} 已排序
 */
export function rankCodes(pack, { scene = null, rankIds = [], text = '', state = {}, recent = [] } = {}) {
    const groups = [
        ['rite', pack.codes?.rites ?? []],
        ['house', pack.codes?.house ?? []],
        ['law', pack.codes?.laws ?? []],
        ['procedure', pack.codes?.procedure ?? []],
        ['clan', pack.codes?.clan ?? []],
    ];
    const recentIds = new Set(
        (recent.length ? recent : (state.traces ?? []).slice(-3).map(t => t.code)).slice(-3),
    );
    const prefer = scene ? SCENE_KIND[scene] ?? [] : [];
    const out = [];

    for (const [kind, list] of groups) {
        for (const code of list) {
            let score = 0;
            const when = code.when ?? [];
            if (scene && when.some(w => w === `scene:${scene}`)) score += 3;
            if (when.includes('任何场合')) score += 1;
            if (rankIds.length && (code.who ?? []).some(w => rankIds.includes(w))) score += 2;
            if (prefer.includes(kind)) score += 2;
            score += textHits(code, text);
            if (recentIds.has(code.id)) score -= 3;
            // 只有场景硬匹配或正文命中，才可能进入候选
            const strong = score >= 4;
            if (strong) out.push({ code: { ...code, kind }, score });
        }
    }

    out.sort((a, b) => b.score - a.score || a.code.id.localeCompare(b.code.id));
    return out;
}

/** 取前 n 条，用于结算提示 */
export function retrieveCodes(pack, opts = {}, limit = 10) {
    return rankCodes(pack, opts).slice(0, limit).map(x => x.code);
}
