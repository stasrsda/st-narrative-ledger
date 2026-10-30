// 称谓块（depth 2）：只在在场者 ≥2 时注入
/**
 * @param {object} o
 * @param {Array} o.onstage [{name, address, self}]
 * @param {object} o.titlesMatrix 包里的 titles.matrix
 * @param {string} o.userName 玩家角色名（如 白景昭）
 */
export function composeAddressBlock({ onstage = [], titlesMatrix = {}, userName = '白景昭' }) {
    if (onstage.length < 2) return { text: '', tokens: 0 };

    const pairs = [];
    for (const a of onstage.slice(0, 6)) {
        if (!a.address) continue;
        pairs.push(`${a.name}→"${a.address}"`);
    }
    if (!pairs.length) return { text: '', tokens: 0 };

    // 大家的称呼完全一样、又没有私称时，这一块没有信息量（在场行里已有 /称"王爷"）
    const distinct = new Set(onstage.slice(0, 6).map(a => a.address).filter(Boolean));
    const hasPrivate = onstage.some(a => {
        const priv = titlesMatrix?.[a.name]?.private;
        return priv?.call && Number(a.aff ?? 0) >= Number(priv.min ?? 0);
    });
    if (distinct.size <= 1 && !hasPrivate) return { text: '', tokens: 0 };

    const lines = [`[称谓] 你称:${pairs.join('、')}`];

    // 私称（好感门槛）来自 titles.matrix 里 {actor: {private: {min, call}}}
    for (const a of onstage.slice(0, 6)) {
        const t = titlesMatrix?.[a.name];
        const priv = t?.private;
        if (!priv || !priv.call) continue;
        if (Number(a.aff ?? 0) >= Number(priv.min ?? 0)) {
            lines.push(`${a.name}私称你:"${priv.call}"`);
        }
    }
    lines.push('泛称:王爷/殿下 不指具体人');

    const text = lines.join('\n');
    return { text, tokens: Math.ceil(text.length / 1.4) };
}
