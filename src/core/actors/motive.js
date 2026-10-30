// 动机：好感 → 可用的动机集合（不锁行为，只决定怎么写）
export function motivesAt(pack, value) {
    const list = (pack.motives ?? []).filter(m => Number.isFinite(m.min) ? value >= m.min : true);
    return list.length ? list : (pack.motives ?? []).slice(0, 1);
}

/** 主档：min 最大且 <= value 的那一个 */
export function primaryMotive(pack, value) {
    const list = motivesAt(pack, value);
    return list[list.length - 1] ?? null;
}

/** 需要名分才有的动机：duty 在位份为空时不可用 */
export function motivesFor(pack, value, { hasRank = true } = {}) {
    return motivesAt(pack, value).filter(m => (m.id === 'duty' ? hasRank : true));
}

/** −30 屈从/交易 */
export function motiveLine(pack, value, opts = {}) {
    const list = motivesFor(pack, value, opts);
    if (!list.length) return '';
    return `${value} ${list.map(m => m.label).join('/')}`;
}
