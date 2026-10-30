import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { validatePack } from '../src/core/pack/validate.js';
import { levelOf, bondOf, blankExp, bumpExp, expOf, expLine, shouldInjectExp, physicalOf, recentOf } from '../src/core/actors/experience.js';
import { openingSeed, openingMeta, openingOf, openingLabel } from '../src/core/runtime/opening.js';
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

test('器官状态：随累计次数变', () => {
    assert.match(physicalOf(pack, 0), /未舒展/);
    assert.match(physicalOf(pack, 2), /仍紧/);
    assert.match(physicalOf(pack, 10), /从容/);
    assert.match(physicalOf(pack, 40), /松弛/);
});

test('间隔：久疏会把状态拉回去', () => {
    const t = 100 * 1440;
    assert.equal(recentOf(pack, { lastT: t - 1440 }, t).label, '频繁');
    assert.equal(recentOf(pack, { lastT: t - 5 * 1440 }, t).label, '如常');
    assert.equal(recentOf(pack, { lastT: t - 20 * 1440 }, t).label, '疏了');
    assert.equal(recentOf(pack, { lastT: t - 200 * 1440 }, t).label, '久疏');
    assert.equal(recentOf(pack, { lastT: t - 200 * 1440 }, t).days, 200);
});

test('经验行包含器官状态与间隔', () => {
    const t = 100 * 1440;
    const line = expLine(pack, '知微', { total: 2, withUser: 2, lastT: t - 20 * 1440 }, t);
    assert.match(line, /身体:/);
    assert.match(line, /疏了（20 日）/);
});

test('从没做过时不给间隔', () => {
    assert.equal(recentOf(pack, { lastT: null }, 999).days, null);
});

test('单场阶段：只在当天有效', async () => {
    const { phaseOf, phaseAlive } = await import('../src/core/actors/experience.js');
    const t = 100 * 1440;
    assert.equal(phaseOf(pack, 'mid').label, '交合');
    assert.equal(phaseAlive(pack, { id: 'mid', t: t - 600 }, t), true);
    assert.equal(phaseAlive(pack, { id: 'mid', t: t - 2 * 1440 }, t), false);
    assert.equal(phaseAlive(pack, { id: 'none', t }, t), false);
});

test('经验行带当前阶段', async () => {
    const { expLine } = await import('../src/core/actors/experience.js');
    const t = 100 * 1440;
    const line = expLine(pack, '知微', { total: 5, withUser: 5, lastT: t - 60 }, t, { id: 'mid', t: t - 30 });
    assert.match(line, /此刻:交合/);
});

test('阶段过期就不提', async () => {
    const { expLine } = await import('../src/core/actors/experience.js');
    const t = 100 * 1440;
    const line = expLine(pack, '知微', { total: 5, withUser: 5, lastT: t - 2 * 1440 }, t, { id: 'mid', t: t - 2 * 1440 });
    assert.ok(!line.includes('此刻'));
});

test('账本：exp 事件记录阶段', async () => {
    const { applyEvent, emptyState } = await import('../src/core/ledger/ledger.js');
    const s = applyEvent(emptyState(), { k: 'exp', actor: 'zhiwei', phase: 'warm', t: 120 });
    assert.equal(s.phase.zhiwei.id, 'warm');
    assert.equal(s.exp.zhiwei.total, 1);
});

test('账本：exp 事件累加并记时刻', async () => {
    const { applyEvent, emptyState } = await import('../src/core/ledger/ledger.js');
    let s = applyEvent(emptyState(), { k: 'clock', t: 5000 });
    s = applyEvent(s, { k: 'exp', actor: 'zhiwei' });
    s = applyEvent(s, { k: 'exp', actor: 'zhiwei', t: 6000 });
    assert.equal(s.exp.zhiwei.total, 2);
    assert.equal(s.exp.zhiwei.withUser, 2);
    assert.equal(s.exp.zhiwei.lastT, 6000);
});

test('结算：intimate 产出 exp 事件', async () => {
    const { normalizeSettle } = await import('../src/llm/schema.js');
    const { toEvents } = await import('../src/llm/settle.js');
    const data = normalizeSettle({ intimate: [{ actor: 'zhiwei' }, { actor: '路人' }] },
        { actorIds: new Set(['zhiwei']) }).data;
    assert.equal(data.intimate.length, 1);
    const ev = toEvents(pack, { done: [], emergent: [] }, data);
    assert.ok(ev.some(e => e.k === 'exp' && e.actor === 'zhiwei'));
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
    assert.equal(renderDate(seed.t), '承平十六年九月十四');
    assert.equal(renderTime(seed.t), '酉初三刻');
    assert.equal(seed.place, 'p_wuli');
});

test('开局：只有霍振在场，知微仍是囚', () => {
    const seed = openingSeed(pack);
    assert.deepEqual(openingOf(pack).onstage, ['huozhen']);
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

test('开局由世界包决定：改包就换开局', () => {
    const p = normalizePack(JSON.parse(JSON.stringify(raw)));
    p.opening.time = { year: 1, month: 2, day: 3, shichen: 4, ke: 2 };
    p.opening.place = 'p_yanhui';
    p.opening.placeName = '雁回县城内';
    p.opening.onstage = [];
    p.opening.label = '改过的开局';
    const seed = openingSeed(p);
    assert.equal(seed.place, 'p_yanhui');
    assert.equal(renderDate(seed.t), '承平元年二月初三');
    assert.deepEqual(openingMeta(p).onstage, []);
    assert.equal(openingLabel(p), '改过的开局');
});

test('开局：包里没写 opening 时用兜底不崩', () => {
    const p = normalizePack(JSON.parse(JSON.stringify(raw)));
    delete p.opening;
    const seed = openingSeed(p);
    assert.equal(renderDate(seed.t), '承平元年正月初一');
    assert.deepEqual(openingOf(p).onstage, []);
    assert.deepEqual(openingOf(p).done, []);
});

test('校验：开局地点不存在要报错', () => {
    const p = normalizePack(JSON.parse(JSON.stringify(raw)));
    p.opening.place = 'p_不存在';
    const errs = validatePack(p).errors.filter(e => e.path === 'opening.place');
    assert.equal(errs.length, 1);
});

test('校验：开局在场者不在册要报错', () => {
    const p = normalizePack(JSON.parse(JSON.stringify(raw)));
    p.opening.onstage = ['路人甲'];
    const errs = validatePack(p).errors.filter(e => e.path === 'opening.onstage');
    assert.equal(errs.length, 1);
});
