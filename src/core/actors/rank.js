// 名分：位份查询、单向升位、注入行
export function rankOf(pack, id) {
    return pack?.index?.rank?.[id] ?? pack?.ranks?.[id] ?? null;
}

/** 位份只能升，不能降（降是重大事件，要手动改 order 之外的东西） */
export function canPromote(pack, fromId, toId) {
    const a = rankOf(pack, fromId);
    const b = rankOf(pack, toId);
    if (!a || !b) return false;
    return b.order > a.order;
}

export function canStayOvernight(pack, rankId) {
    return Boolean(rankOf(pack, rankId)?.overnight);
}

/** 侧妃｜称王爷·自称妾身｜公开:可列内宴｜留宿:可 */
export function rankLine(pack, rankId) {
    const r = rankOf(pack, rankId);
    if (!r) return '';
    const parts = [
        rankId,
        `称${r.address}·自称${r.self}`,
    ];
    if (r.public) parts.push(`公开:${r.public}`);
    parts.push(`留宿:${r.overnight ? '可' : '不可'}`);
    if (r.access && r.access !== 'free') parts.push(`被知:${r.cost ?? r.access}`);
    return parts.join('｜');
}
