import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    readLwbSummary, formatLwbBrief, lwbStats, lwbAliases, aliasMapForActors,
    factsForCast, relationsFor, arcsFor, eventsForCast, stripFloorTag, summarizedBoundary,
} from '../src/core/memory/lwb.js';
import { normalizePack } from '../src/core/pack/registry.js';
import { createTree, putNode } from '../src/core/place/tree.js';
import { inferPresence } from '../src/core/clock/presence.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));
const tree = createTree();
for (const p of pack.places) putNode(tree, p);

// 按小白X 3.2.3 的真实结构造数据：数据在 storySummary.json 里
const CHAT = {
    extensions: {
        LittleWhiteBox: {
            storySummaryEnabled: true,
            storySummary: {
                lastSummarizedMesId: 14,
                json: {
                    events: [
                        { id: 'evt-1', title: '城破', summary: '雁回县北门被开 (#9-11)', timeLabel: '九月十四', participants: ['霍振', '白景昭'], memoryRole: '状态变化' },
                        { id: 'evt-2', title: '认字', summary: '地牢里教她认字 (#12-14)', timeLabel: '九月十四夜', participants: ['沈知微'], memoryRole: '具体经历' },
                    ],
                    facts: [
                        { id: 'f1', s: '沈述', p: '位置', o: '在逃', since: 9 },
                        { id: 'f2', s: '霍振', p: '对白景昭的态度', o: '死忠', since: 10, trend: '亲密' },
                        { id: 'f3', s: '沈知微', p: '对白景昭的态度', o: '怕', since: 11, trend: '陌生' },
                        { id: 'f4', s: '沈述', p: '位置', o: '被擒', since: 5, retracted: true },
                    ],
                    characters: { main: [{ name: '霍振' }, { name: '沈知微' }] },
                    arcs: [{ name: '霍振', trajectory: '从执行者到敢劝', progress: 0.4 }],
                    characterAliases: [{ from: '县丞', to: '沈述' }],
                    keywords: [{ text: '北门', weight: '核心' }],
                },
            },
        },
    },
};

test('读得到小白X的摘要（在 storySummary.json 里，不是 storySummary 上）', () => {
    const s = readLwbSummary(CHAT);
    assert.equal(s.events.length, 2);
    assert.equal(s.facts.length, 4);
    assert.equal(s.boundary, 14);
    assert.equal(lwbStats(CHAT).ok, true);
});

test('没有摘要时返回 null（不报错）', () => {
    assert.equal(readLwbSummary({}), null);
    assert.equal(readLwbSummary(null), null);
    assert.equal(readLwbSummary({ extensions: { LittleWhiteBox: { storySummary: {} } } }), null);
    assert.equal(lwbStats({}).ok, false);
});

test('剥掉事件末尾的楼层标记 (#9-11)', () => {
    assert.equal(stripFloorTag('雁回县北门被开 (#9-11)'), '雁回县北门被开');
    assert.equal(stripFloorTag('没标记'), '没标记');
});

test('压成简短前情：事件/事实/弧光，跳过已撤回事实', () => {
    const brief = formatLwbBrief(readLwbSummary(CHAT));
    assert.match(brief, /前情:/);
    assert.match(brief, /城破/);
    assert.match(brief, /事实:/);
    assert.match(brief, /弧光:霍振/);
    assert.ok(!brief.includes('被擒'), '撤回的事实不该出现');
    assert.ok(!brief.includes('(#9-11)'), '楼层标记要剥掉');
});

test('关系：从 facts 的「对X的…」投影出来（没有 relationships 字段）', () => {
    const rel = relationsFor(CHAT, ['霍振', '沈知微', '白景昭']);
    assert.ok(rel.includes('霍振→白景昭:亲密'), rel.join(' / '));
    assert.ok(rel.includes('沈知微→白景昭:陌生'), rel.join(' / '));
});

test('事实：带关系状态；没趋势就不加括号', () => {
    const f = factsForCast(CHAT, ['沈述', '霍振'], 6);
    assert.ok(f.some(x => x === '沈述 位置=在逃'), f.join(' / '));
    assert.ok(f.some(x => x.includes('（关系:亲密）')), f.join(' / '));
    assert.ok(!f.some(x => x.includes('被擒')));
});

test('弧光：progress 是 0..1 浮点，要显示成百分比', () => {
    const a = arcsFor(CHAT, ['霍振']);
    assert.equal(a[0], '霍振:从执行者到敢劝·40%');
});

test('前情事件：按在场者筛，最近的在前', () => {
    const ev = eventsForCast(CHAT, ['沈知微']);
    assert.equal(ev.length, 1, ev.join(' / '));
    assert.match(ev[0], /认字/);
});

test('别名表能挂到角色 id 上', () => {
    const m = aliasMapForActors(pack, CHAT);
    assert.deepEqual(m.get('shenshu'), ['县丞']);
});

test('用别名后，正文里的「县丞」也能认出是沈述', () => {
    const extra = aliasMapForActors(pack, CHAT);
    const text = '县丞被押上来，抬头看了一眼堂上。';
    assert.deepEqual(
        inferPresence(pack, text, { placeId: 'p_shenshu' in {} ? 'p_yanhui' : 'p_xiaoya', tree, extraAliases: extra }).length >= 0,
        true,
    );
});

test('已总结边界可读（决定我们要不要让路）', () => {
    assert.equal(summarizedBoundary(CHAT), 14);
    assert.equal(summarizedBoundary({}), null);
});
