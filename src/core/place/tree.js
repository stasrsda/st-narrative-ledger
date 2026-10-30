// 地点树：父子、邻接、路径、越界校验、确定性命名
export const SCENES = Object.freeze([
    'street', 'inner_court', 'hall', 'camp', 'prison', 'court', 'temple',
    'market', 'roadside', 'palace', 'study', 'bedroom', 'kitchen', 'stable',
    'gate', 'storehouse',
]);

/** 稳定字符串哈希（32 位 FNV-1a） */
export function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

export function createTree(nodes = {}) {
    return { nodes: { ...nodes } };
}

export function putNode(tree, node) {
    if (!node?.id) throw new Error('节点必须有 id');
    tree.nodes[node.id] = {
        id: node.id,
        name: node.name ?? node.id,
        parent: node.parent ?? null,
        scale: node.scale ?? 'place',
        scene: node.scene ?? 'street',
        climate: node.climate ?? null,
        tags: Array.isArray(node.tags) ? [...node.tags] : [],
        neighbors: Array.isArray(node.neighbors) ? [...node.neighbors] : [],
        idleYears: node.idleYears ?? 0,
    };
    return tree;
}

export function getNode(tree, id) {
    return tree.nodes[id] ?? null;
}

export function children(tree, id) {
    return Object.values(tree.nodes).filter(n => n.parent === id);
}

/** 祖先链（根 → 当前） */
export function ancestors(tree, id) {
    const out = [];
    let cur = tree.nodes[id];
    let guard = 0;
    while (cur && guard++ < 64) {
        out.unshift(cur.id);
        cur = cur.parent ? tree.nodes[cur.parent] : null;
    }
    return out;
}

/** 雁回县 > 北门外五里 */
export function pathLabel(tree, id, sep = '>') {
    return ancestors(tree, id).map(x => tree.nodes[x].name).join(sep);
}

export function siblings(tree, id, limit = 5) {
    const n = tree.nodes[id];
    if (!n) return [];
    const sibs = Object.values(tree.nodes)
        .filter(x => x.parent === n.parent && x.id !== id);
    return sibs.slice(0, limit).map(x => x.id);
}

export function linkNeighbors(tree, a, b) {
    if (!tree.nodes[a] || !tree.nodes[b]) return tree;
    const add = (x, y) => {
        if (!tree.nodes[x].neighbors.includes(y)) tree.nodes[x].neighbors.push(y);
    };
    add(a, b);
    add(b, a);
    return tree;
}

/** 可达性：同一节点或邻接 */
export function canMove(tree, from, to) {
    if (from === to) return true;
    const n = tree.nodes[from];
    return !!n && n.neighbors.includes(to);
}

/** 校验：地点存在、不越界 */
export function validatePlace(tree, id) {
    return { ok: !!tree.nodes[id], id, reason: tree.nodes[id] ? '' : '地点不在册' };
}

const NAME_HEAD = ['青', '临', '清', '安', '宁', '长', '永', '平', '定', '望', '听', '落', '回', '映', '寒'];
const NAME_TAIL = ['坊', '巷', '楼', '渡', '桥', '驿', '台', '铺', '院', '园', '门', '口', '集', '祠'];

/** 确定性命名：同 (世界, 父节点, 序号) 永远同名 */
export function genPlaceName(worldId, parentId, index) {
    const h = hash32(`${worldId}|${parentId}|${index}`);
    const a = NAME_HEAD[h % NAME_HEAD.length];
    const b = NAME_TAIL[(h >>> 8) % NAME_TAIL.length];
    return a + b;
}
