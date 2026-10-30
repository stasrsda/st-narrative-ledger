import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { levelOf, bondOf, blankExp, bumpExp, expOf, expLine, shouldInjectExp } from '../src/core/actors/experience.js';
import { openingSeed, openingMeta, OPENING_ONSTAGE } from '../src/core/runtime/opening.js';
import { renderDate, renderTime } from '../src/core/calendar/guofeng.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

test('经验档：0/1/3/8/20 命中', () => {
    assert.equal(levelOf(pack, 0).label, '未经');
    assert.equal(levelOf(pack, 1).label, '初经');
    assert.equal(levelOf(pack, 3).label, '渐熟');
    assert.equal(levelOf(pack, 8).label, '熟');
    assert.equal(levelOf(pack, 50).label, '老夫老妻');
});

test('与主角的节奏单独算', () => {
    assert.equal(bondOf(pack, 0).label, '初');
    assert.equal(bondOf(pack, 2).label, '二回');
    assert.equal(bondOf(pack, 30).label, '老夫老妻');
});

test('记一次：两个计数一起走', () => {
    const e = bumpExp(blankExp(), 1200);
    assert.deepEqual(e, { total: 1, withUser: 1, lastT: 1200 });
    const e2 = bumpExp(e, 1300);
    assert.equal(e2.total, 2);
});

test('经验行：初次没有次数', () => {
    assert.match(expLine(pack, '知微', { total: 0, withUser: 0 }), /未经/);
    assert.match(expLine(pack, '知微', { total: 1, withUser: 1 }), /初经/);
    assert.match(expLine(pack, '知微', { total: 1, withUser: 1 }), /与你:1 次/);
});

test('注入条件：只在亲密或有人提起时', () => {
    assert.equal(shouldInjectExp({}), false);
    assert.equal(shouldInjectExp({ intimate: true }), true);
    assert.equal(shouldInjectExp({ mentioned: true }), true);
});

test('状态里没有这人时给空经验', () => {
    assert.deepEqual(expOf({}, 'zhiwei'), { total: 0, withUser: 0, lastT: null });
});

test('开局：时间与地点', () => {
    const seed = openingSeed(pack);
    assert.equal(renderDate(seed.t), '承平二十七年九月十四');
    assert.equal(renderTime(seed.t), '酉初三刻');
    assert.equal(seed.place, 'p_wuli');
});

test('开局：只有霍振在场，知微仍是囚', () => {
    const seed = openingSeed(pack);
    assert.deepEqual([...OPENING_ONSTAGE], ['huozhen']);
    assert.equal(seed.rank.zhiwei, '囚');
    assert.equal(seed.aff.zhiwei, -30);
    assert.equal(seed.aff.huozhen, 60);
});

test('开局：城已破、事件只记这一件、器物为空', () => {
    const seed = openingSeed(pack);
    assert.deepEqual(seed.done, ['e_break_city']);
    assert.deepEqual(seed.emergent, []);
    assert.deepEqual(seed.items, {});
});

test('meta：带 placeName 与在场名单', () => {
    const meta = openingMeta(pack);
    assert.equal(meta.placeName, '北门外五里');
    assert.deepEqual(meta.onstage, ['huozhen']);
    assert.equal(meta.placeId, 'p_wuli');
});
