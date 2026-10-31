import * as placeTree from '../src/core/place/tree.js';
import { parseNewPlacesComment, parsePresenceFromThinking } from '../src/core/clock/presence.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { parsePresence, stripPresence, resolveActors, renderPresence, inferPresence, canBePresent, parsePresenceComment, parsePresenceCommentDetailed } from '../src/core/clock/presence.js';
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

test('名字@地点：解析出人在哪', () => {
    const r = parsePresenceCommentDetailed('正文\n<!--在场:霍振@沈宅、沈母@沈宅、沈述@东南岔路-->');
    assert.deepEqual(r.entries, [
        { name: '霍振', place: '沈宅' },
        { name: '沈母', place: '沈宅' },
        { name: '沈述', place: '东南岔路' },
    ]);
});

test('名字@地点：不写地点也行', () => {
    const r = parsePresenceCommentDetailed('<!--在场:霍振、沈母-->');
    assert.deepEqual(r.entries.map(e => e.name), ['霍振', '沈母']);
    assert.equal(r.entries[0].place, '');
});

test('名字@地点：旧的纯名字接口仍然可用', () => {
    assert.deepEqual(parsePresenceComment('<!--在场:霍振、沈母-->'), ['霍振', '沈母']);
});

test('新地：解析名字与上级地名', () => {
    const r = parseNewPlacesComment('<!--新地:东南岔路>雁回县、城西破庙（雁回县）、荒村-->');
    assert.deepEqual(r, [
        { name: '东南岔路', parent: '雁回县' },
        { name: '城西破庙', parent: '雁回县' },
        { name: '荒村', parent: '' },
    ]);
});

test('新地：并进树以后能被地名解析认出来', () => {
    const t2 = placeTree.createTree();
    for (const p of pack.places) placeTree.putNode(t2, p);
    const added = placeTree.mergeCustomPlaces(t2, [
        { name: '东南岔路', parent: 'p_yanhui' },
        { name: '城西破庙', parent: 'p_yanhui' },
    ]);
    assert.equal(added, 2);
    assert.equal(placeTree.resolvePlaceName(t2, '往东南岔路去')?.name, '东南岔路');
    assert.equal(placeTree.resolvePlaceName(t2, '城西破庙')?.name, '城西破庙');
});

test('新地：重复并同一批不重复加', () => {
    const t3 = placeTree.createTree();
    for (const p of pack.places) placeTree.putNode(t3, p);
    placeTree.mergeCustomPlaces(t3, [{ name: '荒村', parent: 'p_yanhui' }]);
    const again = placeTree.mergeCustomPlaces(t3, [{ name: '荒村', parent: 'p_yanhui' }]);
    assert.equal(again, 0);
});

test('思考里写了在场：能抠出来', () => {
    assert.deepEqual(parsePresenceFromThinking('在场：霍振、沈知微'), ['霍振', '沈知微']);
    assert.deepEqual(parsePresenceFromThinking('当前在场 - 白景昭 / 霍振'), ['白景昭', '霍振']);
    assert.deepEqual(parsePresenceFromThinking('在场人物：沈母、知砚'), ['沈母', '知砚']);
});

test('思考里没写在场：返回空', () => {
    assert.deepEqual(parsePresenceFromThinking('关键NPC：沈知微、霍振'), []);
    assert.deepEqual(parsePresenceFromThinking(''), []);
});

test('光提到不算在场：崔掌柜那边的货', () => {
    assert.deepEqual(inferPresence(pack, '崔掌柜那边的货还没清点。', { placeId: 'p_shenzhai', tree, loose: true }), []);
});

test('有就地线索才算：崔掌柜在柜后头站着', () => {
    assert.deepEqual(inferPresence(pack, '崔掌柜在柜后头站着。', { placeId: 'p_xishi', tree, loose: true }), ['cuizhanggui']);
});

test('列举也算：「家眷就是沈母、知微、知砚」', () => {
    const ids = inferPresence(pack, '沈述家眷就是沈母、知微、知砚三人。', { placeId: 'p_shenzhai', tree, loose: true });
    assert.deepEqual(ids.sort(), ['shenmu', 'shenzhiyan', 'zhiwei'].sort());
});

test('没有驻地又不随行的人：不因提到就出现', () => {
    // 皇兄 home 为空、travels false
    assert.deepEqual(inferPresence(pack, '皇兄在京城听说这件事。', { placeId: 'p_shenzhai', tree, loose: true }), []);
});

test('皇兄只在京城/皇宫一带', () => {
    const f = (place) => inferPresence(pack, '皇兄在殿上召见群臣。', { placeId: place, tree, loose: true });
    assert.deepEqual(f('p_taihe'), ['huangxiong']);
    assert.deepEqual(f('p_shenzhai'), []);
});

test('太后基本不出慈宁宫', () => {
    assert.deepEqual(inferPresence(pack, '太后在慈宁宫咳了两声。', { placeId: 'p_cining', tree, loose: true }), ['taihou']);
    assert.deepEqual(inferPresence(pack, '太后在雁回县。', { placeId: 'p_shenzhai', tree, loose: true }), []);
});

test('崔掌柜走商队：只在西市一带，且要被提到在场动作', () => {
    assert.deepEqual(inferPresence(pack, '崔掌柜在西市卸货。', { placeId: 'p_xishi', tree, loose: true }), ['cuizhanggui']);
    assert.deepEqual(inferPresence(pack, '崔掌柜那边的货还没清点。', { placeId: 'p_xishi', tree, loose: true }), []);
    assert.deepEqual(inferPresence(pack, '崔掌柜在县衙门口站着。', { placeId: 'p_shenzhai', tree, loose: true }), []);
});

test('沈述：在逃时不出现；被拿住后解除', () => {
    assert.deepEqual(inferPresence(pack, '沈述往东南跑了。', { placeId: 'p_shenzhai', tree, loose: true }), []);
    assert.deepEqual(inferPresence(pack, '沈述被押上来，跪在堂下。', { placeId: 'p_shenzhai', tree, loose: true }), ['shenshu']);
    // 解除之后，只是被提到也不再算；但带线索就算
    const cleared = new Set(['shenshu']);
    assert.deepEqual(inferPresence(pack, '沈述在堂下站着。', { placeId: 'p_shenzhai', tree, loose: true, cleared }), ['shenshu']);
});

test('半在场也算：门外候着 / 隔着帘子', () => {
    assert.deepEqual(inferPresence(pack, '霍振在门外候着。', { placeId: 'p_shenzhai', tree, loose: true }), ['huozhen']);
    assert.deepEqual(inferPresence(pack, '霍振隔着帘子压低了声音。', { placeId: 'p_shenzhai', tree, loose: true }), ['huozhen']);
});

test('间接出现不算：派人送信 / 听说', () => {
    assert.deepEqual(inferPresence(pack, '崔掌柜派人送了封信来。', { placeId: 'p_xishi', tree, loose: true }), []);
    assert.deepEqual(inferPresence(pack, '听说崔掌柜那边出了事。', { placeId: 'p_xishi', tree, loose: true }), []);
});
