// 把状态 + 世界包拼成一块可注入的文字
import { composeSceneBlock } from '../compose/stateBlock.js';
import { weatherFor, renderWeather } from '../climate/weather.js';
import { festivalOn, nextFestival, renderFestival } from '../climate/festival.js';
import { pathLabel, siblings, ancestors } from '../place/tree.js';
import { rankOf } from '../actors/rank.js';
import { motiveLine } from '../actors/motive.js';
import { bandOf } from '../affinity/affinity.js';
import { grantLine } from '../authority/grants.js';

/** scope id → 中文（与 grants.js 的 scopeCn 保持一致） */
function scopeCnOf(scope) {
    if (scope === '*') return '诸事';
    if (String(scope).startsWith('p_')) return '本院';
    return {
        household: '内宅', ledger: '账目', storehouse: '库房', staff: '人事',
        protocol: '外事', army: '军务', dispatch: '文书', investigate: '查案',
        darkguard: '暗卫', guard: '宿卫', kitchen: '厨下', palace: '内廷',
        court: '朝议', grassland: '草原', county: '州县',
    }[scope] ?? scope;
}
import { renderProps, instantiateProps, condFromIdleYears } from '../props/prototype.js';
import { renderItems } from '../props/items.js';
import { expLine, expOf, shouldInjectExp } from '../actors/experience.js';
import { tableLines } from '../tables/tables.js';

/** 礼法命中：最近几条 trace，渲染成一行 */
function codesLineOf(pack, state) {
    const traces = (state.traces ?? []).slice(-2);
    if (!traces.length) return '';
    const byId = pack.index?.code ?? {};
    const names = traces.map(t => byId[t.code]?.name ?? t.code).filter(Boolean);
    return names.length ? `礼:${[...new Set(names)].join('、')}` : '';
}

/** 地点的标签串：场景/季节/标签 */
function placeTagOf(pack, node, season) {
    if (!node) return '';
    const sceneCn = {
        street: '街市', inner_court: '内宅', hall: '厅堂', camp: '军营', prison: '牢狱',
        court: '衙门', temple: '寺庙', market: '市集', roadside: '道旁', palace: '宫城',
        study: '书房', bedroom: '卧房', kitchen: '厨下', stable: '马厩', gate: '门',
        storehouse: '库房',
    }[node.scene] ?? '';
    const seasonCn = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[season] ?? '';
    const tags = node.tags ?? [];
    return [sceneCn, ...tags, seasonCn].filter(Boolean).join('/');
}

/** 邻近地点 + 禁止写到的远处地点 */
function nearbyOf(tree, placeId) {
    if (!tree || !placeId) return { nearby: '', forbid: '' };
    const node = tree.nodes?.[placeId];
    if (!node) return { nearby: '', forbid: '' };
    const near = siblings(tree, node).slice(0, 3).map(n => n.name);
    const parent = node.parent ? tree.nodes?.[node.parent] : null;
    if (parent && !near.includes(parent.name)) near.unshift(parent.name);
    // 禁止：不在当前祖先链上的其它大区（否则会写出「身在北凉、笔落京城」）
    const chain = new Set(ancestors(tree, placeId));   // 返回的是 id 数组
    chain.add(placeId);
    const regions = Object.values(tree.nodes ?? {})
        .filter(n => n.scale === 'region' && !chain.has(n.id))
        .map(n => n.name)
        .slice(0, 3);
    return {
        nearby: near.length ? `邻:${near.join('/')}` : '',
        forbid: regions.length ? `禁:写${regions.join('、')}` : '',
    };
}

/** 近事：最近几条已完成事件，带相对日 */
function recentOf(pack, state, nowT) {
    const byId = pack.index?.event ?? {};
    const done = (state.done ?? []).slice(-3);
    if (!done.length) return '';
    return done.map(id => byId[id]?.name ?? id).join('|');
}

/** 反应：在场者的姿态（观感）+ 礼法禁项 */
function reactionOf(pack, onstage) {
    if (!onstage.length) return '';
    const first = onstage[0];
    const actor = pack.index?.actor?.[first.id];
    if (!actor) return '';
    const stance = (pack.gaze?.stances ?? []).find(x => x.id === actor.stance);
    const bits = [];
    if (stance?.posture) bits.push(stance.posture);
    if (stance?.eye) bits.push(stance.eye);
    const lines = (actor.lines ?? []).slice(0, 1).map(l => `禁:${l.text}`);
    return [...bits, ...lines].join('｜');
}

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
            isUser: Boolean(a.isUser),
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
export function buildSceneBlock({ pack, state, tree = null, chatSeed = '', meta = {}, budget = 220, showAffNumbers, lean = false }) {
    const placeId = state.place;
    const node = placeId && tree ? tree.nodes?.[placeId] : null;
    const placePath = node ? pathLabel(tree, placeId) : (meta.placeName ?? '');

    const onstage = onstageOf(pack, state, meta);
    // 动机与经验只对「情爱向」的角色有意义；臣属/亲族用 bond 区分，不走这条线
    const focus = onstage.find(o => !o.isUser && (o.bond ?? 'love') === 'love');
    const motive = (!lean && focus) ? `${focus.name} ${motiveLine(pack, focus.aff, { hasRank: !!focus.rank })}` : '';

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

    // holder 可能是 id（包内角色），也可能是名字（剧情里自动登记的官员）
    // 同一个人合并成一行：`权:白景昭 军务·内宅·库房·人事（可处置）`
    const onstageKey = new Set(onstage.flatMap(o => [o.id, o.name]));
    const byHolder = new Map();
    for (const g of state.grants ?? []) {
        if (!onstageKey.has(g.holder)) continue;
        const name = pack.index?.actor?.[g.holder]?.name ?? g.holder;
        const row = byHolder.get(name) ?? { name, scopes: [], rights: new Set() };
        row.scopes.push(scopeCnOf(g.scope));
        for (const r of g.rights ?? []) row.rights.add(r);
        byHolder.set(name, row);
    }
    const auth = [...byHolder.values()].slice(0, 2).map(r => {
        const scopes = [...new Set(r.scopes)].join('·');
        const rights = [...r.rights].map(x => ({ view: '查看', act: '处置', delegate: '转授' }[x] ?? x)).join('·');
        return `${r.name} ${scopes}（${rights}）`;
    });

    const season = w?.season ?? null;
    const placeTag = placeTagOf(pack, node, season);
    const { nearby, forbid } = nearbyOf(tree, placeId);
    const recent = '';
    const reaction = lean ? '' : reactionOf(pack, onstage.filter(a => !a.isUser));
    const codes = lean ? '' : codesLineOf(pack, state);

    let propList = state.props?.[placeId];
    if (!propList && node) {
        if (Array.isArray(node.props) && node.props.length) {
            // 包里写死的陈设：王府各屋是固定的，不随机
            const cond = condFromIdleYears(pack, node.idleYears ?? 0);
            propList = node.props.map(name => ({ name, cond, note: '', since: state.t ?? 0 }));
        } else {
            // 没写死的按场景原型抽（确定性，同一地点永远同一批）
            propList = instantiateProps(pack, {
                placeNode: node, placeId, seed: chatSeed, count: 6, since: state.t ?? 0,
            });
        }
    }
    const props = node ? renderProps(propList ?? [], node.name) : '';
    const items = node ? renderItems(Object.values(state.items ?? {}).filter(i => i.at === placeId), node.name) : '';

    // 经验只在亲密相关时注入：亲密场景、卧室，或有人提起
    let exp = '';
    const intimateScene = meta.intimate || node?.scene === 'bedroom';
    if (focus && shouldInjectExp({ intimate: intimateScene, mentioned: meta.expMentioned })) {
        const e = state.exp?.[focus.id] ?? expOf(state, focus.id);
        const ph = state.phase?.[focus.id] ?? null;
        if (e.total > 0 || intimateScene) exp = expLine(pack, focus.name, e, state.t ?? 0, ph);
    }

    // 表：物价/用色/月例/路程——代码有数据但不常驻，只在当轮提到时才上
    const tables = tableLines(pack, meta.hintText ?? '');

    return composeSceneBlock({
        pack, state, placePath, weather, festival,
        onstage, showAffNumbers, lean, motive, exp, auth, events, tables, props, items, budget,
        placeTag, recent, reaction, codes, nearby: [nearby, forbid].filter(Boolean).join(' | '),
    });
}

/** 好感档位（外部用） */
export { bandOf };
