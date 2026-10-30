import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseHeader, parseTimeChunk, parseCnNumber, ruleDuration, advance,
    rewriteHeader, DURATIONS,
} from '../src/core/clock/clock.js';
import { fromParts, renderTime } from '../src/core/calendar/guofeng.js';

test('解析时辰刻的各种写法', () => {
    assert.deepEqual(parseTimeChunk('子正三刻'), { shichen: 0, ke: 7 });
    assert.deepEqual(parseTimeChunk('酉初三刻'), { shichen: 9, ke: 3 });
    assert.deepEqual(parseTimeChunk('卯时'), { shichen: 3, ke: 5 });
    assert.deepEqual(parseTimeChunk('子时半'), { shichen: 0, ke: 3 });
    assert.deepEqual(parseTimeChunk('午时正'), { shichen: 6, ke: 5 });
    assert.equal(parseTimeChunk('随便什么'), null);
});

test('汉字数字解析', () => {
    assert.equal(parseCnNumber('二十七'), 27);
    assert.equal(parseCnNumber('十四'), 14);
    assert.equal(parseCnNumber('九'), 9);
    assert.equal(parseCnNumber('30'), 30);
    assert.equal(parseCnNumber(''), null);
});

test('解析完整时间头（世界书格式）', () => {
    const r = parseHeader('『承平二十七年九月十四 · 酉初三刻 · 雁回县·北门外五里』');
    assert.ok(r);
    assert.equal(r.place, '雁回县·北门外五里');
    const expect = fromParts({ year: 27, month: 9, day: 14, shichen: 9, ke: 3 });
    assert.equal(r.t, expect);
});

test('没有书名号也能解析', () => {
    const r = parseHeader('承平二十七年九月十四 · 子正一刻 · 北凉城');
    assert.ok(r);
    assert.equal(r.place, '北凉城');
    assert.equal(renderTime(r.t), '子正一刻');
});

test('乱码/空串不崩', () => {
    assert.equal(parseHeader(''), null);
    assert.equal(parseHeader('今天天气不错'), null);
});

test('规则时长：先匹配强词', () => {
    assert.equal(ruleDuration('次日他去了县衙'), 'day');
    assert.equal(ruleDuration('当夜下起了雪'), 'night');
    assert.equal(ruleDuration('半个时辰后'), 'half_hour');
    assert.equal(ruleDuration('没什么特别的'), null);
});

test('推进与枚举', () => {
    const t = fromParts({ year: 1, month: 1, day: 1, shichen: 5, ke: 1 });
    assert.equal(advance(t, 'quarter'), t + 15);
    assert.equal(advance(t, 'day'), t + DURATIONS.day);
    assert.equal(advance(t, '不认识'), t);
});

test('重写时间头：换掉日期时间地名，保留天气', () => {
    const src = '『承平二十七年九月十四 · 酉初三刻 · 雁回县 · 阴』\n正文第一句。';
    const t = fromParts({ year: 28, month: 1, day: 2, shichen: 3, ke: 2 });
    const out = rewriteHeader(src, t, '北凉城');
    assert.match(out, /承平二十八年正月初二/);
    assert.match(out, /卯初二刻/);
    assert.match(out, /北凉城/);
    assert.match(out, /阴/);
    assert.match(out, /正文第一句。/);
    // 幂等：再写一次不变
    assert.equal(rewriteHeader(out, t, '北凉城'), out);
});
