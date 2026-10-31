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
        // 包里写死的陈设，必须带过来，否则会被原型抽样顶替
        props: Array.isArray(node.props) ? [...node.props] : null,
        notables: Array.isArray(node.notables) ? [...node.notables] : null,
        aliases: Array.isArray(node.aliases) ? [...node.aliases] : [],
        officials: Array.isArray(node.officials) ? node.officials.map(o => ({ ...o })) : null,
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

/**
 * 把正文里写的地名解析成地点 id。
 * 先精确匹配，再找出「被包含」的最长地名（雁回县北门 → 北门）。
 */
function treeDepth(tree, id) {
    let d = 0;
    let cur = tree.nodes?.[id];
    while (cur?.parent && d < 20) { cur = tree.nodes[cur.parent]; d++; }
    return d;
}

export function resolvePlaceName(tree, text) {
    const t0 = String(text ?? '').trim();
    if (!t0) return null;

    // 候选：地名本身、别名。都按「包含」命中，取最深的那个；同深度取命中字符串更长的
    const cands = [];
    for (const n of Object.values(tree.nodes ?? {})) {
        if (n?.id && n.name && t0.includes(n.name)) {
            cands.push({ node: n, len: n.name.length });
        }
        for (const a of n?.aliases ?? []) {
            if (a && a.length >= 2 && t0.includes(a)) cands.push({ node: n, len: a.length });
        }
    }
    if (cands.length) {
        cands.sort((a, b) => {
            const d = treeDepth(tree, b.node.id) - treeDepth(tree, a.node.id);
            return d !== 0 ? d : b.len - a.len;
        });
        return cands[0].node;
    }

    // 退回原逻辑：整串相等，再不行按原实现兜底
    return resolvePlaceNameByContain(tree, t0);
}

function resolvePlaceNameByContain(tree, text) {
    const t = String(text ?? '');
    for (const n of Object.values(tree.nodes ?? {})) {
        if (n?.name === t) return n;
    }
    for (const n of Object.values(tree.nodes ?? {})) {
        if (n?.name && t.includes(n.name)) return n;
    }
    return null;
}

/**
 * 把「主模型自己造的地点」并进这棵树。
 * @param {object} tree
 * @param {{id:string,name:string,parent?:string,scene?:string}[]} list
 */
export function mergeCustomPlaces(tree, list) {
    let added = 0;
    for (const c of list ?? []) {
        if (!c?.name) continue;
        const id = c.id || ('p_custom_' + c.name.replace(/[^\w\u4e00-\u9fa5]/g, '') );
        if (tree.nodes[id]) continue;
        putNode(tree, {
            id,
            name: c.name,
            parent: c.parent && tree.nodes[c.parent] ? c.parent : null,
            scale: 'place',
            scene: c.scene || 'street',
            tags: c.tags ?? [],
            aliases: c.aliases ?? [],
        });
        added++;
    }
    return added;
}
