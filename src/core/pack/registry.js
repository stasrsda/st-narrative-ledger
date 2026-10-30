// 世界包仓库：规范化、注册、按聊天解析
import { validatePack } from './validate.js';

/** 补默认值 + 建索引；不改入参 */
export function normalizePack(pack) {
    const p = structuredCloneSafe(pack);
    p.schemaVersion = p.schemaVersion ?? 1;
    p.calendar = { monthDays: 30, months: 12, era: '承平', ...(p.calendar ?? {}) };
    p.climate = { vocabulary: [], zones: [], ...(p.climate ?? {}) };
    for (const z of p.climate.zones ?? []) {
        z.seasonOverride = z.seasonOverride ?? {};
        z.places = z.places ?? [];
    }
    p.festivals = p.festivals ?? [];
    p.affinity = { min: -100, max: 100, step: 10, ladder: [], events: {}, ...(p.affinity ?? {}) };
    p.ranks = p.ranks ?? {};
    p.motives = p.motives ?? [];
    p.codes = { rites: [], house: [], laws: [], ...(p.codes ?? {}) };
    p.places = p.places ?? [];
    p.actors = p.actors ?? [];
    p.events = p.events ?? [];
    p.gaze = { axes: ['respect', 'fear', 'closeness', 'contempt'], stances: [], knowledge: [], temper: [], ...(p.gaze ?? {}) };
    p.tables = p.tables ?? {};
    p.customs = p.customs ?? [];
    p.props = { by_scene: {}, seasonal: {}, ...(p.props ?? {}) };
    p.titles = p.titles ?? { matrix: {} };
    p.authority = p.authority ?? { scopes: [], rights: [], sources: [], seed: [] };
    p.household = p.household ?? { defaults: { head: '王爷亲管', hasMistress: false, noblest: '无' } };

    p.index = {
        zone: toIndex(p.climate.zones, 'id'),
        place: toIndex(p.places, 'id'),
        actor: toIndex(p.actors, 'id'),
        rank: toIndex(Object.entries(p.ranks).map(([id, v]) => ({ id, ...v })), 'id'),
        event: toIndex(p.events, 'id'),
        code: toIndex([...p.codes.rites, ...p.codes.house, ...p.codes.laws], 'id'),
    };
    return p;
}

function toIndex(list, key) {
    const out = {};
    for (const x of list) out[x[key]] = x;
    return out;
}

function structuredCloneSafe(v) {
    if (typeof structuredClone === 'function') return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}

/** 注册表：id → pack（已规范化） */
export function createRegistry() {
    return { packs: {}, order: [], errors: {} };
}

export function addPack(reg, raw) {
    const pack = normalizePack(raw);
    const { ok, errors } = validatePack(pack);
    if (!ok) {
        reg.errors[pack.id ?? '?'] = errors;
        return { ok: false, errors };
    }
    reg.packs[pack.id] = pack;
    if (!reg.order.includes(pack.id)) reg.order.push(pack.id);
    delete reg.errors[pack.id];
    return { ok: true, pack, errors: [] };
}

export function getPack(reg, id) {
    return reg.packs[id] ?? null;
}

/**
 * 解析当前聊天该用哪个包。
 * 1) 显式 packId 且存在 → 用它
 * 2) 世界书名 / 角色卡名匹配 match → 用它
 * 3) 否则回落 defaultId / 第一个
 */
export function resolvePack(reg, { packId, worldBooks = [], characters = [], defaultId } = {}) {
    if (packId && reg.packs[packId]) return { pack: reg.packs[packId], reason: 'explicit' };

    const names = [...worldBooks, ...characters].filter(Boolean);
    for (const id of reg.order) {
        const p = reg.packs[id];
        const m = p.match ?? {};
        const hit = [...(m.worldBooks ?? []), ...(m.characters ?? [])];
        if (hit.some(h => names.some(n => String(n).includes(h) || h.includes(String(n))))) {
            return { pack: p, reason: 'match' };
        }
    }
    if (defaultId && reg.packs[defaultId]) return { pack: reg.packs[defaultId], reason: 'default' };
    const first = reg.order[0];
    return first ? { pack: reg.packs[first], reason: 'fallback' } : { pack: null, reason: 'none' };
}
