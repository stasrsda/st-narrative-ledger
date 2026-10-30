import { ancestors } from '../place/tree.js';

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

/** 名字的别称：全名 + 去掉姓（如 沈知微 → 知微） */
function aliasesOf(actor) {
    const out = new Set();
    const n = String(actor?.name ?? '').trim();
    if (n.length >= 2) {
        out.add(n);
        if (n.length >= 3) out.add(n.slice(1));   // 去姓
        if (n.length >= 4) out.add(n.slice(-2));  // 末二字
    }
    return [...out];
}

/**
 * 从正文里推断谁在场：谁的名字（或别称）出现在这一楼里。
 * 不要求 AI 写任何标记行，也就不会往历史里留垃圾。
 * @returns {string[]} 角色 id（最多 limit 个）
 */
export function inferPresence(pack, text, { limit = 6, placeId = null, tree = null } = {}) {
    const t = String(text ?? '');
    if (!t) return [];
    const hits = [];
    for (const actor of Object.values(pack?.index?.actor ?? {})) {
        // 只要不在自己够得着的地方，被提到也不算在场
        if (!canBePresent(actor, { placeId, tree })) continue;
        const alias = aliasesOf(actor);
        // 用最长的别称判断，避免「知微」误命中别人的名字
        const found = alias.some(a => a.length >= 2 && t.includes(a));
        if (found && !hits.includes(actor.id)) hits.push(actor.id);
    }
    return hits.slice(0, limit);
}

/**
 * 这个人此刻「够得着」吗。
 * 规则：随行的（travels）随便在哪都算；不随行的必须在自家驻地或其下辖地点。
 * 驻地为空（如皇兄在京城）→ 只能靠剧情/手动名单带进来。
 */
export function canBePresent(actor, { placeId = null, tree = null } = {}) {
    if (!actor) return false;
    if (actor.travels) return true;
    const home = actor.home;
    if (!home) return false;
    if (!placeId || !tree) return true;      // 没有位置信息时不拦
    if (home === placeId) return true;
    return ancestors(tree, placeId).includes(home);
}
