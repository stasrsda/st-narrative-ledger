// 季节：月份 → 春夏秋冬；地区可覆写（塞北十月即入冬）
export const DEFAULT_SEASON_BY_MONTH = Object.freeze({
    1: 'winter', 2: 'spring', 3: 'spring', 4: 'spring',
    5: 'summer', 6: 'summer', 7: 'summer',
    8: 'autumn', 9: 'autumn', 10: 'autumn',
    11: 'winter', 12: 'winter',
});

export const SEASON_CN = Object.freeze({ spring: '春', summer: '夏', autumn: '秋', winter: '冬' });

/** zone.seasonOverride 例如 { 10:'winter', 3:'winter' } */
export function seasonOf(month, zone = null) {
    const m = Math.max(1, Math.min(12, Math.trunc(month)));
    const override = zone?.seasonOverride?.[m];
    return override ?? DEFAULT_SEASON_BY_MONTH[m];
}

/** 从世界包里取日历参数 */
export function calOf(pack) {
    const c = pack?.calendar ?? {};
    return {
        era: c.era ?? '承平',
        months: 12,
        monthDays: c.monthDays ?? 30,
        yearFormat: c.yearFormat ?? '{era}{year}年',
    };
}

/** 找地点所属气候带：先看节点 climate，再按名字反查 zones[].places，最后取第一个 */
export function zoneOf(pack, placeNode) {
    const zones = pack?.climate?.zones ?? [];
    if (!zones.length) return null;
    if (placeNode?.climate) {
        const hit = zones.find(z => z.id === placeNode.climate);
        if (hit) return hit;
    }
    const name = placeNode?.name ?? '';
    if (name) {
        const hit = zones.find(z => (z.places ?? []).some(p => name.includes(p) || p.includes(name)));
        if (hit) return hit;
    }
    return zones[0];
}
