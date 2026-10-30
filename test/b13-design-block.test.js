import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { createTree, putNode } from '../src/core/place/tree.js';
import { openingMeta } from '../src/core/runtime/opening.js';
import { buildSceneBlock } from '../src/core/runtime/scene.js';
import { composeAddressBlock } from '../src/core/compose/addressBlock.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

function tree() {
    const t = createTree();
    for (const p of pack.places) putNode(t, p);
    return t;
}

const meta = openingMeta(pack);
const state = { ...meta.seed, place: meta.placeId };

test('§5.1 地标签：场景/标签/季节', () => {
    const b = buildSceneBlock({
        pack, state, tree: tree(), chatSeed: 'x',
        meta: { ...meta, onstage: ['huozhen', 'zhiwei'] }, budget: 999,
    });
    assert.match(b.text, /地:.*\[.*道旁.*\]/);
    assert.match(b.text, /秋/);
});

test('§5.1 反应：给出姿态与禁忌', () => {
    const b = buildSceneBlock({
        pack, state, tree: tree(), chatSeed: 'x',
        meta: { ...meta, onstage: ['zhiwei'] }, budget: 999,
    });
    assert.match(b.text, /反应:/);
});

test('§5.1 邻/禁：不在当前链上的大区才禁写', () => {
    const b = buildSceneBlock({
        pack, state, tree: tree(), chatSeed: 'x',
        meta: { ...meta, onstage: ['huozhen'] }, budget: 999,
    });
    const line = b.text.split('\n').find(l => l.startsWith('邻:')) ?? '';
    assert.ok(line.includes('禁:写'), '应给出禁写范围');
    assert.ok(!line.includes('北凉城'), '当前所在的大区不该被禁写');
});

test('§5.2 称谓块：两人以上才生成', () => {
    const one = composeAddressBlock({
        onstage: [{ name: '沈知微', address: '王爷', aff: 0 }],
        titlesMatrix: pack.titles.matrix,
    });
    assert.equal(one.text, '');

    const two = composeAddressBlock({
        onstage: [
            { name: '沈知微', address: '王爷', aff: 0 },
            { name: '霍振', address: '王爷', aff: 60 },
        ],
        titlesMatrix: pack.titles.matrix,
    });
    assert.match(two.text, /^\[称谓\]/);
    assert.match(two.text, /沈知微→"王爷"/);
    assert.match(two.text, /泛称/);
});

test('精简模式：不带动机/反应/邻', () => {
    const b = buildSceneBlock({
        pack, state, tree: tree(), chatSeed: 'x',
        meta: { ...meta, onstage: ['zhiwei', 'huozhen'] }, budget: 999, lean: true,
    });
    assert.ok(!b.text.includes('动机'));
    assert.ok(!b.text.includes('反应'));
    assert.ok(!b.text.includes('邻:'));
});
