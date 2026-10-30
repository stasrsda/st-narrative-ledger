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
    assert.equal(deltaFor(pack, 'D'), 50);
    assert.equal(deltaFor(pack, 'E'), -40);
    const r = applyKind(pack, 90, 'D');
    assert.equal(r.value, 100);
    assert.ok(r.capped);
});

test('单轮上限：背叛 −40 一轮只算 −30', () => {
    const r = applyKind(pack, 0, 'E', { maxPerRound: 30 });
    assert.equal(r.delta, -30);
    assert.match(r.reason, /单轮/);
});

test('单幕上限：已经花了 70，只能再加 10', () => {
    const r = applyKind(pack, 0, 'C', { arcSpent: 70, capPerArc: 80 });
    assert.equal(r.delta, 10);
    assert.match(r.reason, /单幕/);
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
