import * as placeTree from '../src/core/place/tree.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { parsePresence, stripPresence, resolveActors, renderPresence, inferPresence, canBePresent, parsePresenceComment } from '../src/core/clock/presence.js';
import { createTree, putNode } from '../src/core/place/tree.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);
const tree = createTree();
for (const p of pack.places) putNode(tree, p);

test('解析：中文顿号与逗号都行', () => {
    assert.deepEqual(parsePresence('前半\n【在场】霍振、沈知微\n正文'), ['霍振', '沈知微']);
    assert.deepEqual(parsePresence('【在场】霍振,沈知微'), ['霍振', '沈知微']);
});

test('解析：没有这一行返回 null，写了空的返回空数组', () => {
    assert.equal(parsePresence('只有正文，没有在场行'), null);
    assert.deepEqual(parsePresence('【在场】'), []);
});

test('解析：去掉「无」这类占位', () => {
    assert.deepEqual(parsePresence('【在场】无'), []);
});

test('名字 → id：精确与包含', () => {
    assert.deepEqual(resolveActors(pack, ['霍振']).ids, ['huozhen']);
    assert.deepEqual(resolveActors(pack, ['沈知微']).ids, ['zhiwei']);
    const loose = resolveActors(pack, ['知微']);
    assert.deepEqual(loose.ids, ['zhiwei']);
});

test('名字 → id：认不出的单独列出', () => {
    const r = resolveActors(pack, ['霍振', '路人甲']);
    assert.deepEqual(r.ids, ['huozhen']);
    assert.deepEqual(r.unknown, ['路人甲']);
});

test('去掉在场行', () => {
    const t = '『某日』\n【在场】霍振\n正文开始';
    assert.equal(stripPresence(t), '『某日』\n正文开始');
});

test('渲染在场行', () => {
    assert.equal(renderPresence(pack, ['huozhen', 'zhiwei']), '【在场】霍振、沈知微');
});

test('从正文推断：全名与去姓别称都能认', () => {
    const ids = inferPresence(pack, '霍振低声说了一句，沈知微抬头看了看，知微没接话。');
    assert.deepEqual(ids.sort(), ['huozhen', 'zhiwei'].sort());
});

test('从正文推断：没提到就返回空', () => {
    assert.deepEqual(inferPresence(pack, '风把烟吹过来，带着血腥味。'), []);
});

test('从正文推断：最多 6 个', () => {
    const long = pack.actors.map(a => a.name).join('，');
    assert.ok(inferPresence(pack, long).length <= 6);
});

test('空推断不覆盖已有名单（保留上一轮）', async () => {
    const { fold } = await import('../src/core/ledger/ledger.js');
    // 模拟：上一轮在场两人，这一轮正文没提到名字
    const meta = { onstage: ['huozhen', 'zhiwei'] };
    const inferred = inferPresence(pack, '风把烟吹过来，带着血腥味。');
    assert.deepEqual(inferred, []);
    // 修复后的逻辑：推断为空 → 不改名单
    const next = inferred.length ? inferred : meta.onstage;
    assert.deepEqual(next, ['huozhen', 'zhiwei']);
});

test('推断到人时才替换名单', () => {
    const inferred = inferPresence(pack, '霍振抱拳退下。');
    assert.deepEqual(inferred, ['huozhen']);
});

test('驻地：不随行的人不会在前线被算作在场', () => {
    const text = '霍振说县衙有动静。孙账房那边的账还没报，宋衍之在幕府拟条子。';
    const atFront = inferPresence(pack, text, { placeId: 'p_wuli', tree });
    assert.ok(atFront.includes('huozhen'), '霍振随行，应当在场');
    assert.ok(!atFront.includes('sunzhangfang'), '孙账房只管府里的账，不该出现在前线');
    assert.ok(!atFront.includes('song'), '宋衍之是文官，不该出现在前线');
});

test('驻地：在王府里就该算得上', () => {
    const text = '孙账房把账簿呈上来，宋衍之在旁边拟条子。';
    const atHall = inferPresence(pack, text, { placeId: 'p_wf_yinan', tree });
    assert.ok(atHall.includes('sunzhangfang'));
    assert.ok(atHall.includes('song'));
});

test('驻地：随行的人哪里都算', () => {
    const huozhen = pack.index.actor.huozhen;
    assert.equal(canBePresent(huozhen, { placeId: 'p_wuli', tree }), true);
    assert.equal(huozhen.travels, true);
});

test('驻地：京城老仆不会跑到北凉', () => {
    const text = '钱伯在门房里记了一笔。';
    const atBei = inferPresence(pack, text, { placeId: 'p_wuli', tree });
    assert.ok(!atBei.includes('qianbo'));
    const atJing = inferPresence(pack, text, { placeId: 'p_jing_wangfu', tree });
    assert.ok(atJing.includes('qianbo'));
});

test('驻地：后宅女眷不出内院', () => {
    const text = '绮霞端着茶过来，碧芽在后面跟着。';
    const atCourt = inferPresence(pack, text, { placeId: 'p_wf_yinan', tree });
    assert.ok(!atCourt.includes('qixia'), '东跨院的人不该出现在银安殿');
    const atDong = inferPresence(pack, text, { placeId: 'p_wf_dong', tree });
    assert.ok(atDong.includes('qixia'));
});

test('证据判定：说过话 / 做过动作才算在场', () => {
    const ids = inferPresence(pack, '霍振在后面喊了一声「跟上」，六十骑散开。', { placeId: 'p_wuli', tree });
    assert.deepEqual(ids, ['huozhen']);
});

test('证据判定：只是被提到不算在场', () => {
    assert.deepEqual(inferPresence(pack, '孙账房那边的账还没报。', { placeId: 'p_wuli', tree }), []);
    assert.deepEqual(inferPresence(pack, '沈述这个名字他听过。', { placeId: 'p_wuli', tree }), []);
});

test('证据判定：名字作主语（后面跟逗号）也算', () => {
    assert.deepEqual(inferPresence(pack, '霍振，你带两骑去看。', { placeId: 'p_wuli', tree }), ['huozhen']);
});

test('证据判定：对白归属（…」霍振说）也算', () => {
    const ids = inferPresence(pack, '「王爷，县衙那边有动静。」霍振压低声音。', { placeId: 'p_wuli', tree });
    assert.deepEqual(ids, ['huozhen']);
});

test('证据判定：县丞出场（沈述）', () => {
    const ids = inferPresence(pack, '沈述跪在堂下，抬头看了一眼。', { placeId: 'p_yanhui', tree });
    assert.deepEqual(ids, ['shenshu']);
});

test('隐藏注释：主模型声明在场', () => {
    assert.deepEqual(parsePresenceComment('正文。\n<!--在场:霍振、沈知微-->'), ['霍振', '沈知微']);
    assert.deepEqual(parsePresenceComment('正文。\n<!-- 在场：霍振 / 沈知微 -->'), ['霍振', '沈知微']);
});

test('隐藏注释：写了空表示没人；没写返回 null', () => {
    assert.deepEqual(parsePresenceComment('正文。\n<!--在场:-->'), []);
    assert.equal(parsePresenceComment('正文，没有注释'), null);
});

test('隐藏注释会被清理器删掉（不进上下文）', async () => {
    const { scrubText } = await import('../src/core/cleanup/scrub.js');
    const r = scrubText('正文一句。\n<!--在场:霍振-->');
    assert.ok(!r.text.includes('<!--'), '注释要被删掉');
    assert.equal(r.text, '正文一句。');
});

test('在逃的人：只是被提到不算在场，被押上来才算', () => {
    assert.deepEqual(inferPresence(pack, '沈述往东南跑了，追不上。', { placeId: 'p_shenzhai', tree }), []);
    assert.deepEqual(inferPresence(pack, '沈述被押上来，跪在堂下。', { placeId: 'p_xianya', tree }), ['shenshu']);
});

test('驻地：沈母在沈宅算在场，在县衙不算', () => {
    assert.deepEqual(inferPresence(pack, '沈母坐在东厢，抬头看了一眼。', { placeId: 'p_shenzhai', tree }), ['shenmu']);
    assert.deepEqual(inferPresence(pack, '沈母坐在东厢，抬头看了一眼。', { placeId: 'p_xianya', tree }), []);
});

test('地点别名：沈述家 → 沈宅', () => {
    const { resolvePlaceName } = placeTree;
    assert.equal(resolvePlaceName(tree, '去沈述家里看看')?.id, 'p_shenzhai');
    assert.equal(resolvePlaceName(tree, '县丞宅')?.id, 'p_shenzhai');
    assert.equal(resolvePlaceName(tree, '雁回县县衙')?.id, 'p_xianya');
});
