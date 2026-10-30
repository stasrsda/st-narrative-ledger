// 把状态 + 世界包拼成一块可注入的文字
import { composeSceneBlock } from '../compose/stateBlock.js';
import { weatherFor, renderWeather } from '../climate/weather.js';
import { festivalOn, nextFestival, renderFestival } from '../climate/festival.js';
import { pathLabel } from '../place/tree.js';
import { rankOf } from '../actors/rank.js';
import { motiveLine } from '../actors/motive.js';
import { bandOf } from '../affinity/affinity.js';
import { grantLine } from '../authority/grants.js';
import { renderProps } from '../props/prototype.js';
import { renderItems } from '../props/items.js';
import { expLine, expOf, shouldInjectExp } from '../actors/experience.js';

/** 未结事件：软前置直接算可发生；硬前置要求全满足 */
export function pendingEvents(pack, state, limit = 3) {
    const done = new Set(state.done ?? []);
    const list = (pack.events ?? [])
        .filter(e => !done.has(e.id))
        .filter(e => e.soft ? true : (e.requires ?? []).every(r => done.has(r)))
        .sort((a, b) => (a.arc ?? 0) - (b.arc ?? 0));
    return list.slice(0, limit);
}

export function doneEventNames(pack, state, limit = 2) {
    const byId = pack.index?.event ?? {};
    return (state.done ?? []).slice(-limit).map(id => byId[id]?.name ?? id);
}

/** 在场者：由 meta.onstage 指定，缺省取好感表里最近活跃的 */
export function onstageOf(pack, state, meta = {}) {
    const ids = (meta.onstage ?? []).filter(id => pack.index?.actor?.[id]);
    const list = ids.map(id => {
        const a = pack.index.actor[id];
        const rank = state.rank?.[id] ?? a.rank;
        const r = rankOf(pack, rank);
        return {
            id,
            name: a.name,
            aff: state.aff?.[id] ?? a.aff ?? 0,
            address: r?.address ?? '',
            rank,
            bond: a.bond ?? 'love',
        };
    });
    return list;
}

/**
 * 组装这一轮的 [状态] 块
 */
export function buildSceneBlock({ pack, state, tree = null, chatSeed = '', meta = {}, budget = 220 }) {
    const placeId = state.place;
    const node = placeId && tree ? tree.nodes?.[placeId] : null;
    const placePath = node ? pathLabel(tree, placeId) : (meta.placeName ?? '');

    const onstage = onstageOf(pack, state, meta);
    // 动机与经验只对「情爱向」的角色有意义；臣属/亲族用 bond 区分，不走这条线
    const focus = onstage.find(o => (o.bond ?? 'love') === 'love');
    const motive = focus ? `${focus.name} ${motiveLine(pack, focus.aff, { hasRank: !!focus.rank })}` : '';

    const w = node ? weatherFor({ pack, placeNode: node, t: state.t ?? 0, chatSeed }) : null;
    const weather = w?.word ? renderWeather(w) : '';

    const todayF = festivalOn(pack, state.t ?? 0);
    const nextF = todayF ? { ...todayF, days: 0 } : nextFestival(pack, state.t ?? 0, 7);
    const festival = nextF ? renderFestival(nextF) : '';

    const pending = pendingEvents(pack, state, 3).map(e => e.name);
    const doneNames = doneEventNames(pack, state, 2);
    const events = [
        pending.length ? `未结：${pending.join('、')}` : '',
        doneNames.length ? `已结：${doneNames.join('、')}` : '',
    ].filter(Boolean).join('｜');

    const auth = (state.grants ?? [])
        .filter(g => onstage.some(o => o.id === g.holder))
        .slice(0, 2)
        .map(grantLine);

    const props = node ? renderProps(state.props?.[placeId] ?? [], node.name) : '';
    const items = node ? renderItems(Object.values(state.items ?? {}).filter(i => i.at === placeId), node.name) : '';

    // 经验只在亲密场景或有人提起时注入，避免不分场合地暗示
    let exp = '';
    if (focus && shouldInjectExp({ intimate: meta.intimate, mentioned: meta.expMentioned })) {
        const e = state.exp?.[focus.id] ?? expOf(state, focus.id);
        if (e.total > 0 || meta.intimate) exp = expLine(pack, focus.name, e);
    }

    return composeSceneBlock({
        pack, state, placePath, weather, festival,
        onstage, motive, exp, auth, events, props, items, budget,
    });
}

/** 好感档位（外部用） */
export { bandOf };
