import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import * as placeTree from '../src/core/place/tree.js';
const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));
import test from 'node:test';
import assert from 'node:assert/strict';
import { turnMinutes, advanceTurn, renderAdvance, DEFAULT_TURN_MINUTES } from '../src/core/clock/auto.js';
import { fromParts, renderTime, toDate } from '../src/core/calendar/guofeng.js';

const T0 = fromParts({ year: 16, month: 9, day: 14, shichen: 9, ke: 3 }); // 酉初三刻

test('明确时间跳转优先：次日 = 一天', () => {
    const r = turnMinutes('次日清晨再议。');
    assert.equal(r.minutes, 1440);
    assert.match(r.why, /一天/);
});

test('一个时辰 = 两小时', () => {
    assert.equal(turnMinutes('约莫一个时辰后。').minutes, 120);
});

test('场景类型：审讯一小时、就寝八小时', () => {
    assert.equal(turnMinutes('堂审开始。').minutes, 60);
    assert.equal(turnMinutes('他睡下了。').minutes, 480);
});

test('都没命中时用默认值', () => {
    const r = turnMinutes('他走过去。');
    assert.equal(r.minutes, DEFAULT_TURN_MINUTES);
    assert.match(r.why, /默认/);
});

test('推进：时间真的往后走', () => {
    const r = advanceTurn(T0, '他走过去。');
    assert.equal(r.t, T0 + DEFAULT_TURN_MINUTES);
    assert.equal(renderTime(r.t), '酉正一刻');
});

test('推进：跨日', () => {
    const r = advanceTurn(T0, '睡下了。');
    assert.deepEqual(toDate(r.t), { year: 16, month: 9, day: 15 });
});

test('推进文案', () => {
    assert.match(renderAdvance(1440, '文中提到一天'), /1 天/);
    assert.match(renderAdvance(60, '场景类型'), /1 小时/);
    assert.match(renderAdvance(30, '默认一轮'), /30 分钟/);
});

test('按用户输入推进：跨日/出门都能算', () => {
    const t0 = fromParts({ year: 16, month: 9, day: 14, shichen: 9, ke: 3 });
    assert.equal(advanceTurn(t0, '次日清晨再议').minutes, 1440);
    assert.ok(advanceTurn(t0, '他出城北上').minutes >= 720);
});

test('地点解析：用户说“回府”能认出镇北王府', () => {
    const { createTree, putNode, resolvePlaceName } = placeTree;
    const tree = createTree();
    for (const p of pack.places) putNode(tree, p);
    assert.equal(resolvePlaceName(tree, '回镇北王府')?.id, 'p_wangfu');
    assert.equal(resolvePlaceName(tree, '去雁回县县衙')?.id, 'p_xianya');
});
