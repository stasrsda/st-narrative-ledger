// 器物：从原型实例化。首次进入某地点时抽一次，之后以实例为准。
import { hash32 } from '../place/tree.js';

export const COND_RANK = Object.freeze({ 损: 0, 陈: 1, 旧: 2, 新: 3 });

/** 闲置年数 → 状态 */
export function condFromIdleYears(pack, years = 0) {
    const list = pack?.props?.age?.thresholds ?? [];
    if (!list.length) return '旧';
    const y = Math.max(0, Number(years) || 0);
    for (const t of list) {
        const until = Number.isFinite(t.until) ? t.until : Infinity;
        if (y >= t.idleYears && y < until) return t.cond;
    }
    return list[list.length - 1].cond;
}

function pool(pack, scene) {
    return pack?.props?.by_scene?.[scene] ?? [];
}

/**
 * 从原型抽一组器物（确定性：同 seed 同结果）
 * @returns {Array<{name:string, cond:string, note:string, since:number}>}
 */
export function instantiateProps(pack, { placeNode, placeId = '', seed = '', count = 6, since = 0 } = {}) {
    const list = pool(pack, placeNode?.scene);
    if (!list.length) return [];
    const n = Math.max(1, Math.min(count, list.length));
    const picked = [];
    const used = new Set();
    let i = 0;
    while (picked.length < n && i < n * 20) {
        const h = hash32(`${seed}|${placeId}|${i}`);
        const idx = h % list.length;
        if (!used.has(idx)) {
            used.add(idx);
            picked.push(list[idx]);
        }
        i++;
    }
    const cond = condFromIdleYears(pack, placeNode?.idleYears ?? 0);
    return picked.map(name => ({
        name,
        cond,
        note: cond === '陈' ? '罩布，积灰' : cond === '损' ? '有裂' : '',
        since,
    }));
}

/** 陈设注入行：[陈设] 寝殿：架子床(罩布·漆裂) 铜炉(锈) */
export function renderProps(props = [], placeName = '') {
    if (!props.length) return '';
    const body = props.slice(0, 6).map(p => {
        const note = p.note ? `·${p.note}` : '';
        return `${p.name}(${p.cond}${note})`;
    }).join(' ');
    return `[陈设] ${placeName ? placeName + '：' : ''}${body}`;
}
