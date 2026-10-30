import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import {
    priceLine, colorLine, stipendLine, travelLine, tableLines,
    wantsPrices, wantsColors, wantsTravel, priceIndex,
} from '../src/core/tables/tables.js';
import { composeSceneBlock } from '../src/core/compose/stateBlock.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

test('触发词：买银子提钱，穿衣提色，赶路提程', () => {
    assert.equal(wantsPrices('我买一斤肉'), true);
    assert.equal(wantsPrices('今日天气'), false);
    assert.equal(wantsColors('她换了件青色的袄'), true);
    assert.equal(wantsTravel('到京城要几天'), true);
});

test('物价：默认常年不乘系数', () => {
    assert.equal(priceIndex(pack, '常年'), 1);
    const line = priceLine(pack, { items: ['米一石', '猪肉一斤'] });
    assert.match(line, /米一石 1200/);
    assert.match(line, /（文·常年）/);
});

test('物价：战乱翻倍', () => {
    const line = priceLine(pack, { index: '战乱', items: ['米一石'] });
    assert.match(line, /米一石 2640/);
    assert.match(line, /×2\.2/);
});

test('用色：带僭越提示', () => {
    const line = colorLine(pack);
    assert.match(line, /明黄=帝后/);
    assert.match(line, /逾色即僭/);
});

test('月例：按位份，只取前两个修饰', () => {
    const line = stipendLine(pack, { ranks: ['正妃', '妾'] });
    assert.match(line, /正妃 20000/);
    assert.match(line, /妾 8000/);
});

test('路程', () => {
    assert.match(travelLine(pack), /北凉城→京城 14 天/);
});

test('按文本决定挂哪几行', () => {
    const a = tableLines(pack, '我去买点炭，顺便问问米价');
    assert.deepEqual(a.map(x => x.key), ['price', 'stipend']);
    const b = tableLines(pack, '她穿了件新裙子');
    assert.deepEqual(b.map(x => x.key), ['color']);
    const c = tableLines(pack, '今天天气不错');
    assert.deepEqual(c, []);
});

test('状态块里能塞表，且预算超了先丢表', () => {
    const block = composeSceneBlock({
        pack, state: { t: 0 }, placePath: '某地',
        tables: tableLines(pack, '买米'), budget: 999,
    });
    assert.match(block.text, /\[价\]/);
    const tight = composeSceneBlock({
        pack, state: { t: 0 }, placePath: '某地',
        tables: tableLines(pack, '买米'), budget: 20,
    });
    assert.ok(tight.dropped.includes('price'));
});
