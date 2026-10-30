// 物品：位置、持有、归属、来由。四元组各管一件事。
export const HOLDS = Object.freeze(['borrow', 'give', 'move', 'loot', 'unknown']);

export function createItem({ id, name, at = null, holder = null, owner = null, cond = '旧', hold = 'unknown', qty = 1, since = 0, note = '' }) {
    return { id, name, at, holder, owner, cond, hold, qty, since, note };
}

/** 移动/转手：只改持有，不改归属 */
export function moveItem(item, { to = item.at, holder = item.holder, hold = item.hold, since = item.since } = {}) {
    return { ...item, at: to, holder, hold, since };
}

export function itemsAt(items = [], placeId) {
    return items.filter(i => i.at === placeId && !i.holder);
}

export function itemsOf(items = [], holderId) {
    return items.filter(i => i.holder === holderId);
}

export function holdInfo(pack, holdId) {
    return (pack?.props?.hold?.kinds ?? []).find(k => k.id === holdId) ?? null;
}

/** 该不该被取回：制度决定，不问模型 */
export function willBeReturned(pack, item) {
    const info = holdInfo(pack, item?.hold);
    return Boolean(info?.force);
}

/** 次日该送回的东西 */
export function dueForReturn(pack, items = []) {
    return items.filter(i => willBeReturned(pack, i));
}

/** 注入行：[物] 东跨院：棉被(旧·府物·借用,明日或取回) */
export function renderItems(items = [], placeName = '') {
    if (!items.length) return '';
    const body = items.slice(0, 4).map(i => {
        const bits = [i.cond];
        if (i.owner) bits.push(i.owner === 'storehouse' ? '府物' : '私物');
        const info = i.hold && i.hold !== 'give' ? i.hold : '';
        const tail = info === 'borrow' ? '借用,明日或取回'
            : info === 'unknown' ? '未明言,按借用办'
                : info === 'loot' ? '抄没' : '';
        return `${i.name}(${bits.join('·')}${tail ? '·' + tail : ''})`;
    }).join(' ');
    return `[物] ${placeName ? placeName + '：' : ''}${body}`;
}
