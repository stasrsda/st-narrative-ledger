import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { bandOf, deltaFor, applyKind, affLine } from '../src/core/affinity/affinity.js';
import { motivesAt, primaryMotive, motivesFor, motiveLine } from '../src/core/actors/motive.js';
import { rankOf, canPromote, canStayOvernight, rankLine } from '../src/core/actors/rank.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

test('档位：-30 是「怕」，0 是「无感」', () => {
    assert.equal(bandOf(pack, -30).name, '怕');
    assert.equal(bandOf(pack, 0).name, '无感');
    assert.equal(bandOf(pack, 100).name, '唯一');
    assert.equal(bandOf(pack, 999).value, 100);
});

test('事件表与夹取', () => {
    // 数值从包里读，别写死（改档位时测试不该跟着坏）
    assert.equal(deltaFor(pack, 'D'), pack.affinity.events.D);
    assert.equal(deltaFor(pack, 'E'), pack.affinity.events.E);
    assert.ok(deltaFor(pack, 'A') > 0 && deltaFor(pack, 'A') <= 2, '日常只加一两分');
    // 从 95 起加一次 D，应当被夹到 100
    const r = applyKind(pack, 95, 'D');
    assert.equal(r.value, 100);
    assert.ok(r.capped);
});

test('单轮上限：正向上限挡住重复加分', () => {
    const e = pack.affinity.events.E;
    const r = applyKind(pack, 0, 'E', { maxPerRound: 5 });
    assert.equal(r.delta, e, '负分照原值');
});

test('单幕上限：已经到了上限就加不动', () => {
    const cap = pack.affinity.capPerArc;
    const r = applyKind(pack, 0, 'C', { arcSpent: cap - 2, capPerArc: cap });
    assert.ok(r.delta <= 2, `应当被截到 2 以内，实际 ${r.delta}`);
});

test('注入行', () => {
    assert.equal(affLine(pack, -30), '-30 怕');
});

test('动机：低好感只有屈从/交易', () => {
    const ids = motivesAt(pack, -40).map(m => m.id);
    assert.deepEqual(ids, ['dread']);
    const ids2 = motivesAt(pack, -10).map(m => m.id);
    assert.deepEqual(ids2, ['dread', 'bargain']);
});

test('动机：高好感全档可用，主档是最后一档', () => {
    assert.equal(primaryMotive(pack, 90).id, 'desire');
    assert.deepEqual(motivesFor(pack, 90).map(m => m.id), ['dread', 'bargain', 'debt', 'duty', 'desire']);
});

test('动机：没有名分时「义务」不可用', () => {
    const noRank = motivesFor(pack, 90, { hasRank: false }).map(m => m.id);
    assert.ok(!noRank.includes('duty'));
});

test('动机行', () => {
    assert.equal(motiveLine(pack, -10), '-10 屈从/交易');
});

test('位份：查询与单向升位', () => {
    assert.equal(rankOf(pack, '囚').order, 1);
    assert.equal(canPromote(pack, '囚', '通房'), true);
    assert.equal(canPromote(pack, '侧妃', '妾'), false);
    assert.equal(canPromote(pack, '妾', '妾'), false);
});

test('留宿：只有正妃侧妃可以', () => {
    assert.equal(canStayOvernight(pack, '正妃'), true);
    assert.equal(canStayOvernight(pack, '妾'), false);
    assert.equal(canStayOvernight(pack, '囚'), false);
});

test('位份行', () => {
    const line = rankLine(pack, '妾');
    assert.match(line, /称王爷·自称妾身/);
    assert.match(line, /留宿:不可/);
});

test('bond 决定词表：赵伯 70 是「死忠」不是「深爱」', () => {
    assert.equal(bandOf(pack, 70, 'loyalty').name, '死忠');
    assert.equal(bandOf(pack, 70, 'love').name, '深爱');   // 用错词表就会变成这个
    assert.equal(bandOf(pack, 60, 'loyalty').name, '心腹');
    assert.equal(bandOf(pack, 40, 'loyalty').name, '信服');
});

test('bond 决定词表：亲族用 kin', () => {
    assert.equal(bandOf(pack, 30, 'kin').name, '亲近');
    assert.equal(bandOf(pack, 20, 'kin').name, '亲近');
    assert.equal(bandOf(pack, -30, 'kin').name, '生分');
});

test('女眷仍用 love 词表', () => {
    assert.equal(bandOf(pack, -30, 'love').name, '怕');
    assert.equal(bandOf(pack, 60, 'love').name, '爱');
});

test('包里每个角色的 bond 都有对应词表', () => {
    for (const a of pack.actors) {
        const bond = a.bond ?? 'love';
        if (bond === 'love') continue;
        assert.ok(Array.isArray(pack.affinity[bond]), `${a.name} 的 bond=${bond} 没有词表`);
        assert.equal(pack.affinity[bond].length, pack.affinity.ladder.length);
    }
});
