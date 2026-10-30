// 在场行解析：主模型在正文前写【在场】名字、名字
export const PRESENCE_MARK = '【在场】';

const RE = /【在场】[ \t:：]*([^\n]*)/;

/** 从正文里取出【在场】那一行的人名数组（去重、去空） */
export function parsePresence(text) {
    const m = String(text ?? '').match(RE);
    if (!m) return null;          // 没写这一行 → null（区别于写了但为空）
    const raw = m[1] ?? '';
    const names = raw
        .split(/[、,，/｜|\s]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => !/^(无|无人|空|—|-)$/.test(s));
    return [...new Set(names)];
}

/** 去掉【在场】这一行（如果不想让它留在正文里） */
export function stripPresence(text) {
    return String(text ?? '').replace(/^[ \t]*【在场】[^\n]*\n?/m, '');
}

/**
 * 名字 → 角色 id。先精确匹配，再按包含匹配。
 * @returns {{ids:string[], unknown:string[]}}
 */
export function resolveActors(pack, names = []) {
    const actors = Object.values(pack?.index?.actor ?? {});
    const ids = [];
    const unknown = [];
    for (const raw of names) {
        const n = String(raw).trim();
        if (!n) continue;
        const exact = actors.find(a => a.name === n || a.id === n);
        if (exact) {
            if (!ids.includes(exact.id)) ids.push(exact.id);
            continue;
        }
        const loose = actors.find(a => n.includes(a.name) || a.name.includes(n));
        if (loose) {
            if (!ids.includes(loose.id)) ids.push(loose.id);
        } else {
            unknown.push(n);
        }
    }
    return { ids, unknown };
}

/** 一行给人看的在场文本 */
export function renderPresence(pack, ids = []) {
    const names = ids.map(id => pack?.index?.actor?.[id]?.name ?? id);
    return PRESENCE_MARK + names.join('、');
}
