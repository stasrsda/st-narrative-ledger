import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { composeSceneBlock, estimateTokens } from '../src/core/compose/stateBlock.js';
import { pendingEvents, doneEventNames, onstageOf, buildSceneBlock } from '../src/core/runtime/scene.js';
import { createTree, putNode } from '../src/core/place/tree.js';
import { fromParts } from '../src/core/calendar/guofeng.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);
const t = fromParts({ year: 16, month: 9, day: 14, shichen: 9, ke: 3 });

function tree() {
    const tr = createTree();
    putNode(tr, { id: 'p_yanhui', name: '雁回县', parent: null, scene: 'street', climate: 'saibei' });
    putNode(tr, { id: 'p_wuli', name: '北门外五里', parent: 'p_yanhui', scene: 'roadside', climate: 'saibei', idleYears: 0 });
    return tr;
}

test('估算 token：中文按 1.4 字/token', () => {
    assert.equal(estimateTokens('一二三四五六七八九十'), 8);
    assert.equal(estimateTokens(''), 0);
});

test('骨架：头、在场、尾都在', () => {
    const b = composeSceneBlock({
        pack, state: { t }, placePath: '雁回县>北门外五里',
        onstage: [{ name: '沈知微', aff: -30, address: '王爷' }],
    });
    assert.match(b.text, /^\[状态·只读·勿复述\]/);
    assert.match(b.text, /时:承平十六年九月十四·酉初三刻/);
    assert.match(b.text, /地:雁回县>北门外五里/);
    assert.match(b.text, /在场:沈知微\(-30\/怕\/称"王爷"\)/);
    assert.match(b.text, /与<info>冲突时以本块为准。/);
});

test('预算超了先丢物品，再丢陈设', () => {
    const b = composeSceneBlock({
        pack, state: { t }, placePath: '雁回县',
        onstage: [{ name: '沈知微', aff: -30 }],
        props: '[陈设] ' + '床'.repeat(80),
        items: '[物] ' + '被'.repeat(80),
        budget: 60,
    });
    assert.ok(b.dropped.includes('items'));
    assert.ok(b.tokens <= 60 || b.dropped.length > 0);
    assert.match(b.text, /与<info>冲突时以本块为准。/);
});

test('未结事件：软前置不挡，硬前置要满足', () => {
    const st = { done: ['e_break_city', 'e_dungeon'] };
    const names = pendingEvents(pack, st, 30).map(e => e.name);
    assert.ok(names.includes('查布防图'));
    // 完婚的硬前置是「行六礼」，没做就不该出现
    assert.ok(!names.includes('完婚'));
    // 收房没有硬前置，随时可发生 —— 由玩家决定，不靠前置锁
    assert.ok(names.includes('收房'));
});

test('已结事件取最近两条', () => {
    const names = doneEventNames(pack, { done: ['e_break_city', 'e_dungeon', 'e_defect_map'] }, 2);
    assert.deepEqual(names, ['地牢认字', '查布防图']);
});

test('在场者：位份取当前状态，称呼来自位份', () => {
    const list = onstageOf(pack, { aff: { zhiwei: 40 }, rank: { zhiwei: '妾' } }, { onstage: ['zhiwei', 'huozhen'] });
    assert.equal(list.length, 2);
    assert.equal(list[0].aff, 40);
    assert.equal(list[0].address, '王爷');
    assert.equal(list[0].rank, '妾');
    assert.equal(list[1].aff, 60);   // 用包里初值
});

test('整块：带天气与节令', () => {
    const b = buildSceneBlock({
        pack,
        state: { t, place: 'p_wuli', aff: { zhiwei: -30 }, done: ['e_break_city'] },
        tree: tree(),
        chatSeed: 'c1',
        meta: { onstage: ['zhiwei'] },
    });
    assert.match(b.text, /^\[状态·只读·勿复述\]/);
    assert.match(b.text, /地:雁回县>北门外五里/);
    assert.match(b.text, /天:/);
    assert.ok(b.tokens > 0);
});

test('整块：地点不在册也不崩', () => {
    const b = buildSceneBlock({ pack, state: { t, place: 'p_nope' }, tree: tree(), chatSeed: 'c1', meta: {} });
    assert.match(b.text, /^\[状态/);
    assert.ok(!b.text.includes('地:'));
});

test('精简模式：在场只给名字，不带好感', () => {
    const b = composeSceneBlock({
        pack, state: { t }, placePath: '雁回县',
        onstage: [{ name: '沈知微', aff: -30, address: '王爷' }],
        lean: true,
        motive: '沈知微 -30 屈从',
        auth: ['知微 账目（查看）'],
        budget: 999,
    });
    assert.match(b.text, /在场:沈知微/);
    assert.ok(!b.text.includes('-30'), '精简模式不该出现好感数值');
    assert.ok(!b.text.includes('动机'), '精简模式不该出现动机');
    assert.ok(!b.text.includes('权:'), '精简模式不该出现职权');
});

test('完整模式：仍然带好感', () => {
    const b = composeSceneBlock({
        pack, state: { t }, placePath: '雁回县',
        onstage: [{ name: '沈知微', aff: -30, address: '王爷' }],
        lean: false,
        budget: 999,
    });
    assert.match(b.text, /在场:沈知微\(-30\/怕/);
});
