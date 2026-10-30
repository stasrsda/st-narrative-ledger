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

const heavy = {
    ...seed,
    place: 'p_wf_yinan',
    traces: [{ code: 'seating', kind: 'rite' }, { code: 'gift', kind: 'rite' }],
    items: { jade: { name: '玉佩', where: 'p_wf_yinan', held: 'baijingzhao' } },
};
const meta = { seed, placeId: 'p_wf_yinan', placeName: '银安殿', onstage: ['baijingzhao', 'huozhen', 'song', 'zhaobo'] };

test('不设上限：一行都不丢', () => {
    const b = buildSceneBlock({ pack, state: heavy, tree, chatSeed: 'c', meta, budget: Number.POSITIVE_INFINITY });
    assert.deepEqual(b.dropped, []);
    // 关键行都在
    for (const key of ['时:', '地:', '在场:', '礼:', '权:', '事件:', '邻:', '[陈设]']) {
        assert.ok(b.text.includes(key), `缺 ${key}`);
    }
});

test('不设上限时确实比 220 上限保留更多', () => {
    const capped = buildSceneBlock({ pack, state: heavy, tree, chatSeed: 'c', meta, budget: 220 });
    const full = buildSceneBlock({ pack, state: heavy, tree, chatSeed: 'c', meta, budget: Number.POSITIVE_INFINITY });
    assert.ok(full.text.length >= capped.text.length);
    assert.ok(capped.dropped.length > 0 || full.tokens === capped.tokens);
});

test('不设上限时 token 仍然可读（不超过 600）', () => {
    const b = buildSceneBlock({ pack, state: heavy, tree, chatSeed: 'c', meta, budget: Number.POSITIVE_INFINITY });
    assert.ok(b.tokens < 600, `现在 ${b.tokens}`);
});

test('注入槽位只有一份：状态块文本不含历史楼层', () => {
    const b = buildSceneBlock({ pack, state: heavy, tree, chatSeed: 'c', meta, budget: Number.POSITIVE_INFINITY });
    // 块里不该出现「第 N 楼」这类历史痕迹
    assert.ok(!/第\s*\d+\s*楼/.test(b.text));
    // 也不该出现我们注入用的标记以外的块标记
    assert.equal(b.text.split('[状态·只读·勿复述]').length, 2, '只应有一个状态块开头');
});
