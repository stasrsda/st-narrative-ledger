// 地点树与底单的测试
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { createTree, putNode, resolvePlaceName, pathLabel } from '../src/core/place/tree.js';
import { openingSeed } from '../src/core/runtime/opening.js';
import { buildSceneBlock } from '../src/core/runtime/scene.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));

// 包里本来就有两个同名「书房」：镇北王府的书房 / 京城凉王府的书房
function treeWithTwoStudies() {
    const t = createTree();
    for (const p of pack.places) putNode(t, p);
    return t;
}

test('地点显示：从大到小的树状路径', () => {
    const t = treeWithTwoStudies();
    assert.equal(pathLabel(t, 'p_shenzhai'), '北凉城>雁回县>沈宅');
    assert.equal(pathLabel(t, 'p_wf_shufang'), '北凉城>镇北王府>书房');
    assert.equal(pathLabel(t, 'p_jw_shufang'), '京城>凉王府>书房');
});

test('同名小地点：写全路径能分辨', () => {
    const t = treeWithTwoStudies();
    assert.equal(resolvePlaceName(t, '镇北王府>书房')?.id, 'p_wf_shufang');
    assert.equal(resolvePlaceName(t, '京城凉王府>书房')?.id, 'p_jw_shufang');
});

test('同名小地点：只写「书房」按当前地点消歧', () => {
    const t = treeWithTwoStudies();
    assert.equal(resolvePlaceName(t, '书房', { fromId: 'p_wangfu' })?.id, 'p_wf_shufang');
    assert.equal(resolvePlaceName(t, '书房', { fromId: 'p_jing_wangfu' })?.id, 'p_jw_shufang');
});

test('底单：状态块里给出要抄的那一行', () => {
    const t = treeWithTwoStudies();
    const seed = openingSeed(pack);
    const b = buildSceneBlock({
        pack,
        state: { ...seed, place: 'p_shenzhai' },
        tree: t,
        chatSeed: 'x',
        meta: {
            seed, placeId: 'p_shenzhai', placeName: '沈宅',
            onstage: ['huozhen'],
            headerLine: '『承平十六年九月十四 · 亥初三刻 · 沈宅』',
        },
        budget: Number.POSITIVE_INFINITY,
    });
    assert.match(b.text, /底单:/);
    assert.match(b.text, /沈宅/);
    assert.match(b.text, /原样抄/);
});

test('地点行本身也是树状', () => {
    const t = treeWithTwoStudies();
    const seed = openingSeed(pack);
    const b = buildSceneBlock({
        pack, state: { ...seed, place: 'p_shenzhai' }, tree: t, chatSeed: 'x',
        meta: { seed, placeId: 'p_shenzhai', onstage: ['huozhen'] },
        budget: Number.POSITIVE_INFINITY,
    });
    assert.match(b.text, /地:北凉城>雁回县>沈宅/);
});
