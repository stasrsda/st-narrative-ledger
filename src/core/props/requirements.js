// 需求与缺口：事件之后，这间屋「必须」有什么，缺的列出来
import { COND_RANK } from './prototype.js';

function condOk(need, have) {
    const want = need.cond ?? null;
    if (!want) return true;
    const needRank = COND_RANK[want] ?? 0;
    const haveRank = COND_RANK[have] ?? 0;
    if (want === '可用') return haveRank >= 1;   // 除了「损」都算可用
    return haveRank >= needRank;
}

function poolOf(props = [], items = []) {
    return [
        ...props.map(p => ({ name: p.name, cond: p.cond })),
        ...items.map(i => ({ name: i.name, cond: i.cond })),
    ];
}

/** 单条需求 → 缺什么 */
export function evaluateRule(rule, { props = [], items = [] } = {}) {
    const have = poolOf(props, items);
    const missing = [];
    for (const need of rule?.need ?? []) {
        const hit = have.find(h => h.name.includes(need.item) || need.item.includes(h.name));
        const qty = need.qty ?? 1;
        if (!hit || !condOk(need, hit.cond) || (typeof qty === 'number' && qty > 1 && have.filter(h => h.name.includes(need.item)).length < qty)) {
            missing.push({ item: need.item, spec: need.spec ?? '', why: !hit ? '缺' : '不合用' });
        }
    }
    return { ruleId: rule?.id, name: rule?.name, missing, satisfied: missing.length === 0 };
}

/** 触发某个事件后，该地点还缺什么 */
export function gapsFor(pack, { trigger, placeId = null, props = [], items = [] } = {}) {
    const rules = pack?.props?.requirements?.rules ?? [];
    const hit = rules.filter(r => r.trigger === trigger && (!placeId || !r.scope || r.scope === placeId || r.scope.includes('全府') || r.scope.includes('居所') || r.scope.includes('该')));
    return hit.map(r => ({ ...evaluateRule(r, { props, items }), leadDays: r.leadDays ?? 0, ifMissing: r.ifMissing ?? '' }))
        .filter(g => !g.satisfied);
}

/** 缺口注入行：[缺] 侍寝前：床(不合用) 帐(缺) ｜ 距纳妾礼 3 日 */
export function renderGap(gap, deadlineDays = null) {
    if (!gap?.missing?.length) return '';
    const body = gap.missing.map(m => `${m.item}(${m.why === '缺' ? '缺' : '不合用'})`).join(' ');
    const tail = deadlineDays != null ? ` ｜ 距${gap.name} ${deadlineDays} 日` : '';
    return `[缺] ${gap.name}：${body}${tail}`;
}

/** 补给：库房有就走调拨，没有就采买 */
export function supplyFor(pack, missingItem, { stock = [] } = {}) {
    const paths = pack?.props?.supply?.paths ?? [];
    const byId = id => paths.find(p => p.id === id);
    const hasStock = stock.some(s => s.name?.includes(missingItem) || missingItem.includes(s.name ?? ''));
    return hasStock ? (byId('store') ?? null) : (byId('buy') ?? null);
}
