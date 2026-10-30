import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { condFromIdleYears, instantiateProps, renderProps } from '../src/core/props/prototype.js';
import {
    createItem, moveItem, itemsAt, itemsOf, willBeReturned, dueForReturn, renderItems, holdInfo,
} from '../src/core/props/items.js';
import { evaluateRule, gapsFor, renderGap, supplyFor } from '../src/core/props/requirements.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

test('闲置年数 → 状态', () => {
    assert.equal(condFromIdleYears(pack, 0), '新');
    assert.equal(condFromIdleYears(pack, 5), '旧');
    assert.equal(condFromIdleYears(pack, 15), '陈');
    assert.equal(condFromIdleYears(pack, 50), '损');
});

test('实例化：确定性、不重复、受 count 限制', () => {
    const node = { scene: 'bedroom', idleYears: 15 };
    const a = instantiateProps(pack, { placeNode: node, placeId: 'p_x', seed: 'c1', count: 4 });
    const b = instantiateProps(pack, { placeNode: node, placeId: 'p_x', seed: 'c1', count: 4 });
    const c = instantiateProps(pack, { placeNode: node, placeId: 'p_y', seed: 'c1', count: 4 });
    assert.deepEqual(a, b);
    assert.equal(a.length, 4);
    assert.equal(new Set(a.map(x => x.name)).size, 4);
    assert.ok(a.every(x => x.cond === '陈'));
    assert.notDeepEqual(a.map(x => x.name), c.map(x => x.name));
});

test('实例化：没有原型时返回空', () => {
    assert.deepEqual(instantiateProps(pack, { placeNode: { scene: 'no_such' }, placeId: 'p' }), []);
});

test('陈设渲染', () => {
    const props = [{ name: '架子床', cond: '陈', note: '罩布，积灰' }, { name: '铜炉', cond: '陈', note: '' }];
    assert.equal(renderProps(props, '寝殿'), '[陈设] 寝殿：架子床(陈·罩布，积灰) 铜炉(陈)');
});

test('物品：移动只改持有，不改归属', () => {
    const it = createItem({ id: 'it1', name: '棉被', at: 'p_wf_zheng', owner: 'storehouse', cond: '旧' });
    const moved = moveItem(it, { to: 'p_wf_dong', hold: 'give' });
    assert.equal(moved.at, 'p_wf_dong');
    assert.equal(moved.owner, 'storehouse');
    assert.equal(moved.hold, 'give');
    assert.equal(it.at, 'p_wf_zheng');   // 原对象不变
});

test('物品：按地点、按人、按持有关系', () => {
    const items = [
        createItem({ id: 'a', name: '棉被', at: 'p_dong', hold: 'borrow' }),
        createItem({ id: 'b', name: '炭盆', at: 'p_dong', holder: 'zhiwei', hold: 'give' }),
        createItem({ id: 'c', name: '玉镯', at: 'p_zheng', hold: 'loot' }),
    ];
    assert.deepEqual(itemsAt(items, 'p_dong').map(i => i.id), ['a']);
    assert.deepEqual(itemsOf(items, 'zhiwei').map(i => i.id), ['b']);
});

test('归还：借用与未明言会被取回，赏给不会', () => {
    const items = [
        createItem({ id: 'a', name: '棉被', hold: 'borrow' }),
        createItem({ id: 'b', name: '炭盆', hold: 'give' }),
        createItem({ id: 'c', name: '灯', hold: 'unknown' }),
        createItem({ id: 'd', name: '箱', hold: 'loot' }),
    ];
    assert.deepEqual(dueForReturn(pack, items).map(i => i.id), ['a', 'c']);
    assert.equal(willBeReturned(pack, items[1]), false);
    assert.equal(holdInfo(pack, 'borrow').label, '借用');
});

test('物品渲染', () => {
    const items = [
        createItem({ id: 'a', name: '棉被', cond: '旧', owner: 'storehouse', hold: 'borrow' }),
        createItem({ id: 'b', name: '炭盆', cond: '损', hold: 'give' }),
    ];
    const line = renderItems(items, '东跨院');
    assert.match(line, /棉被\(旧·府物·借用,明日或取回\)/);
    assert.match(line, /炭盆\(损\)/);
});

test('需求：空屋缺两件', () => {
    const rule = (pack.props.requirements.rules ?? []).find(r => r.id === 'concubine_room');
    const r = evaluateRule(rule, { props: [], items: [] });
    assert.equal(r.satisfied, false);
    assert.ok(r.missing.length >= 2);
});

test('需求：条件不合用要报出来', () => {
    const rule = (pack.props.requirements.rules ?? []).find(r => r.id === 'concubine_room');
    const r = evaluateRule(rule, {
        props: [
            { name: '床', cond: '损' }, { name: '帐', cond: '旧' }, { name: '炭', cond: '新' }, { name: '灯', cond: '新' },
        ],
    });
    assert.ok(r.missing.some(m => m.item === '床' && m.why === '不合用'));
});

test('需求：齐了就不报', () => {
    const rule = (pack.props.requirements.rules ?? []).find(r => r.id === 'concubine_room');
    const r = evaluateRule(rule, {
        props: [
            { name: '双人床', cond: '旧' }, { name: '帐', cond: '旧' }, { name: '炭', cond: '新' }, { name: '灯', cond: '新' },
        ],
    });
    assert.equal(r.satisfied, true);
});

test('缺口：按事件触发，带期限', () => {
    const gaps = gapsFor(pack, { trigger: 'event:rank_up:妾', placeId: 'p_wf_dong', props: [], items: [] });
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].leadDays, 3);
    assert.match(renderGap(gaps[0], 3), /^\[缺\] 妾室侍寝：/);
    assert.match(renderGap(gaps[0], 3), /距妾室侍寝 3 日/);
});

test('补给：库房有走调拨，没有走采买', () => {
    assert.equal(supplyFor(pack, '床', { stock: [{ name: '床' }] }).id, 'store');
    assert.equal(supplyFor(pack, '床', { stock: [] }).id, 'buy');
});
