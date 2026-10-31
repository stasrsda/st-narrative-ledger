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

export function resolvePlaceName(tree, text, opts = {}) {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    const fromId = opts.fromId ?? null;   // 当前所在，用来消歧同名小地点

    // ① 路径写法：「镇北王府>书房」「北凉城／镇北王府／书房」
    if (/[>》〉\/／]/.test(raw)) {
        for (const piece of raw.split(/[，,。；;\s]+/)) {
            const segs = piece.split(/[>》〉\/／]+/).map(x => x.trim()).filter(Boolean);
            if (segs.length < 2) continue;
            const found = walkPath(tree, segs);
            if (found) return found;
        }
    }

    // ② 精确名 / 别名 / 包含，取最深；同深度优先「和当前地点同一支」的
    const cands = [];
    for (const n of Object.values(tree.nodes ?? {})) {
        if (!n?.id) continue;
        if (n.name && raw.includes(n.name)) cands.push({ node: n, len: n.name.length });
        for (const a of n.aliases ?? []) {
            if (a && a.length >= 2 && raw.includes(a)) cands.push({ node: n, len: a.length });
        }
    }
    if (cands.length) {
        const sameBranch = (id) => {
            if (!fromId) return 0;
            const a = ancestors(tree, id);
            const b = ancestors(tree, fromId);
            let k = 0;
            while (k < a.length && k < b.length && a[k] === b[k]) k++;
            return k;   // 共同前缀越长越可能是同一个地方
        };
        cands.sort((a, b) => {
            const d = treeDepth(tree, b.node.id) - treeDepth(tree, a.node.id);
            if (d !== 0) return d;
            const sb = sameBranch(b.node.id) - sameBranch(a.node.id);
            if (sb !== 0) return sb;
            return b.len - a.len;
        });
        return cands[0].node;
    }
    return null;
}

/** 按名字逐段往下走：大>小>更小（第一段可以在任意层级） */
function walkPath(tree, segs) {
    const byName = (n, seg) => n.name === seg || (n.aliases ?? []).includes(seg);
    const fuzzy = (n, seg) => n.name.includes(seg) || seg.includes(n.name);

    // 找一个起点：名字等于第一段的所有节点，优先最浅的
    let anchors = Object.values(tree.nodes ?? {}).filter(n => byName(n, segs[0]));
    if (!anchors.length) anchors = Object.values(tree.nodes ?? {}).filter(n => fuzzy(n, segs[0]));
    if (!anchors.length) return null;
    anchors = anchors.sort((a, b) => treeDepth(tree, a.id) - treeDepth(tree, b.id));

    for (const anchor of anchors) {
        let cur = anchor;
        let ok = true;
        for (const seg of segs.slice(1)) {
            const pool = children(tree, cur.id);
            const hit = pool.find(n => byName(n, seg)) ?? pool.find(n => fuzzy(n, seg));
            if (!hit) { ok = false; break; }
            cur = hit;
        }
        if (ok) return cur;
    }
    return null;
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
