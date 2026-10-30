import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { createTree, putNode } from '../src/core/place/tree.js';
import { openingSeed } from '../src/core/runtime/opening.js';
import { buildSceneBlock } from '../src/core/runtime/scene.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));
const tree = createTree();
for (const p of pack.places) putNode(tree, p);
const seed = openingSeed(pack);

function block(onstage, lean = false) {
    const meta = { seed, placeId: 'p_wf_yinan', placeName: '银安殿', onstage };
    return buildSceneBlock({
        pack, state: { ...seed, place: 'p_wf_yinan' }, tree, chatSeed: 'c', meta, budget: 999, lean,
    }).text;
}

test('白景昭在 actors 里且标记 isUser', () => {
    const me = pack.index.actor.baijingzhao;
    assert.ok(me, '应该有 白景昭');
    assert.equal(me.isUser, true);
    assert.equal(me.name, '白景昭');
});

test('玩家在场：只写名字，不带分数与档位', () => {
    const t = block(['baijingzhao', 'huozhen']);
    const line = t.split('\n').find(l => l.startsWith('在场:'));
    assert.ok(line.includes('白景昭'));
    assert.ok(!line.includes('白景昭('), '玩家不该带括号数值');
    assert.ok(line.includes('霍振(60'), 'NPC 仍然带数值');
});

test('动机与反应不给玩家', () => {
    const t = block(['baijingzhao', 'zhiwei']);
    const motive = t.split('\n').find(l => l.startsWith('动机:')) ?? '';
    const reaction = t.split('\n').find(l => l.startsWith('反应:')) ?? '';
    assert.ok(!motive.includes('白景昭'), '动机行不该是玩家');
    assert.ok(reaction.length > 0);
});

test('孙账房的设定来自世界书：只管账，不是做假账', () => {
    const sun = pack.index.actor.sunzhangfang;
    const text = (sun.lines ?? []).map(l => l.text).join('');
    assert.ok(text.includes('只管账'), '应有「只管账，不管别的」');
    assert.ok(!text.includes('假账'), '不该出现我编的「做假账」');
    assert.ok(!text.includes('少两成'), '不该出现我编的「少两成」');
});

test('职权里白景昭没有全局', () => {
    const mine = pack.authority.seed.filter(g => g.holder === 'baijingzhao');
    assert.ok(mine.length > 0);
    assert.ok(!mine.some(g => g.scope === '*'), '不该有全局职权');
    assert.ok(mine.some(g => g.scope === 'army'), '应有兵权');
});
