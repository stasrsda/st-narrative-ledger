import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readLwbSummary, formatLwbBrief, lwbStats, lwbAliases, aliasMapForActors } from '../src/core/memory/lwb.js';
import { normalizePack } from '../src/core/pack/registry.js';
import { createTree, putNode } from '../src/core/place/tree.js';
import { inferPresence } from '../src/core/clock/presence.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));
const tree = createTree();
for (const p of pack.places) putNode(tree, p);

const CHAT = {
    extensions: {
        LittleWhiteBox: {
            storySummary: {
                events: [
                    { title: '城破', participants: ['霍振', '白景昭'], timeLabel: '九月十四', summary: '雁回县北门被开' },
                    { title: '认字', participants: ['沈知微'], timeLabel: '九月十四夜', summary: '地牢里教她认字' },
                ],
                facts: [
                    { s: '沈述', p: '位置', o: '在逃', since: 3 },
                    { s: '沈述', p: '位置', o: '被擒', since: 5, retracted: true },
                ],
                arcs: [{ name: '霍振', trajectory: '从执行者到敢劝' }],
                characters: { main: ['霍振', '沈述'] },
                characterAliases: [{ from: '县丞', to: '沈述' }],
            },
        },
    },
};

test('读得到小白X的摘要', () => {
    const s = readLwbSummary(CHAT);
    assert.equal(s.events.length, 2);
    assert.equal(lwbStats(CHAT).ok, true);
});

test('没有摘要时返回 null（不报错）', () => {
    assert.equal(readLwbSummary({}), null);
    assert.equal(readLwbSummary(null), null);
    assert.equal(lwbStats({}).ok, false);
});

test('压成简短前情：事件/事实/弧光，跳过已撤回事实', () => {
    const brief = formatLwbBrief(readLwbSummary(CHAT));
    assert.match(brief, /前情:/);
    assert.match(brief, /城破/);
    assert.match(brief, /事实:位置=在逃/);
    assert.ok(!brief.includes('被擒'), '撤回的事实不该出现');
    assert.match(brief, /弧光:霍振/);
});

test('前情不会太长（给副模型的空间有限）', () => {
    const brief = formatLwbBrief(readLwbSummary(CHAT));
    assert.ok(brief.length < 400, `现在 ${brief.length} 字`);
});

test('别名表能挂到角色 id 上', () => {
    const chat = { extensions: { LittleWhiteBox: { storySummary: { characterAliases: [
        { from: '县丞', to: '沈述' },
        { from: '老霍', to: '霍振' },
    ] } } } };
    const m = aliasMapForActors(pack, chat);
    assert.deepEqual(m.get('shenshu'), ['县丞']);
    assert.deepEqual(m.get('huozhen'), ['老霍']);
});

test('用别名后，正文里的「县丞」也能认出是沈述', () => {
    const chat = { extensions: { LittleWhiteBox: { storySummary: { characterAliases: [
        { from: '县丞', to: '沈述' },
    ] } } } };
    const extra = aliasMapForActors(pack, chat);
    const text = '县丞抬头看了一眼堂上。';
    assert.deepEqual(inferPresence(pack, text, { placeId: 'p_yanhui', tree, extraAliases: extra }), ['shenshu']);
    assert.deepEqual(inferPresence(pack, text, { placeId: 'p_yanhui', tree }), []);
});

test('不说话也算在场（有“没有说话”这类线索）', () => {
    const ids = inferPresence(pack, '知微没有说话，只把袖口攥紧了。', { placeId: 'p_wf_xi', tree });
    assert.deepEqual(ids, ['zhiwei']);
});
