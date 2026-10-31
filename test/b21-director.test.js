import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { createTree, putNode } from '../src/core/place/tree.js';
import { openingSeed } from '../src/core/runtime/opening.js';
import { buildOutline } from '../src/core/runtime/director.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));
const tree = createTree();
for (const p of pack.places) putNode(tree, p);
const seed = openingSeed(pack);

function outline(placeId, onstage, text) {
    return buildOutline(pack, { ...seed, place: placeId }, { seed, placeId, onstage }, text, tree);
}

test('大纲：有场、人、礼、可发、节奏、接', () => {
    const o = outline('p_xianya', ['baijingzhao', 'shenshu'], '把县丞带上来问话');
    const t = o.text;
    for (const key of ['场:', '人:', '礼:', '节奏:', '接:']) {
        assert.ok(t.includes(key), `缺 ${key}`);
    }
    assert.match(t, /^<导演>/);
    assert.match(t, /<\/导演>$/);
});

test('大纲：问话会命中勘问', () => {
    const o = outline('p_xianya', ['shenshu'], '带上来问话');
    assert.match(o.text, /勘问/);
});

test('大纲：可发列的是事件名，不是 [object Object]', () => {
    const o = outline('p_wuli', ['huozhen'], '进城');
    assert.ok(!o.text.includes('[object Object]'), '不能出现对象字面量');
});

test('大纲：token 控制在 250 以内', () => {
    const o = outline('p_yanhui', ['baijingzhao', 'huozhen', 'shenshu'], '进城查问');
    assert.ok(o.tokens < 250, `现在 ${o.tokens}`);
});
