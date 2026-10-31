import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { createTree, putNode } from '../src/core/place/tree.js';
import { openingSeed } from '../src/core/runtime/opening.js';
import { buildOutline } from '../src/core/runtime/director.js';
import { buildOutlineMessages, renderModelOutline } from '../src/llm/outline.js';

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

test('副模型编排：请求里带上规则骨架与玩家输入', () => {
    const msgs = buildOutlineMessages({
        ruleOutline: '<导演>场:县衙</导演>',
        userText: '把县丞带上来',
        onstage: ['霍振', '沈述'],
        placeName: '县衙',
        recent: '城破',
    });
    assert.equal(msgs.length, 2);
    const u = msgs[1].content;
    assert.match(u, /县衙/);
    assert.match(u, /把县丞带上来/);
    assert.match(u, /霍振/);
});

test('副模型编排：beats 渲染成大纲', () => {
    const text = renderModelOutline(
        { beats: [{ who: '霍振', do: '拔刀挡在前面' }, { who: '沈述', do: '抬头看了一眼' }], hook: '门外一聲響' },
        '<导演>场:县衙</导演>',
    );
    assert.match(text, /编排:/);
    assert.match(text, /霍振：拔刀挡在前面/);
    assert.match(text, /留:门外一聲響/);
});

test('副模型编排：解析不出来就返回空串（回落规则大纲）', () => {
    assert.equal(renderModelOutline(null, 'x'), '');
    assert.equal(renderModelOutline({ beats: [] }, 'x'), '');
});
