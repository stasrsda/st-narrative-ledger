import test from 'node:test';
import assert from 'node:assert/strict';
import {
    toDate, fromDate, fromParts, renderTime, renderDate, renderHeader,
    shichenIndex, keOf, MIN_PER_DAY, cnNum,
} from '../src/core/calendar/guofeng.js';

test('时辰与刻：已知时刻', () => {
    assert.equal(renderTime(fromParts({ year: 1, month: 1, day: 1, shichen: 0, ke: 1 })), '子初一刻');
    assert.equal(renderTime(fromParts({ year: 1, month: 1, day: 1, shichen: 0, ke: 5 })), '子正一刻');
    assert.equal(renderTime(fromParts({ year: 1, month: 1, day: 1, shichen: 6, ke: 5 })), '午正一刻');
    assert.equal(keOf(fromParts({ year: 1, month: 1, day: 1, shichen: 9, ke: 8 })), 8);
    assert.equal(shichenIndex(fromParts({ year: 1, month: 1, day: 1, shichen: 11, ke: 1 })), 11);
});

test('日期：跨月与跨年', () => {
    const d1 = fromDate({ year: 1, month: 12, day: 30 });
    assert.deepEqual(toDate(d1), { year: 1, month: 12, day: 30 });
    assert.deepEqual(toDate(d1 + MIN_PER_DAY), { year: 2, month: 1, day: 1 });
    const d2 = fromDate({ year: 15, month: 9, day: 14 });
    assert.deepEqual(toDate(d2), { year: 15, month: 9, day: 14 });
});

test('渲染：年号 + 月日 + 时间 + 地名', () => {
    const t = fromParts({ year: 15, month: 9, day: 14, shichen: 9, ke: 3 });
    assert.equal(renderDate(t), '承平十五年九月十四');
    assert.equal(renderTime(t), '酉初三刻');
    assert.equal(renderHeader(t, '雁回县·北门外五里'), '『承平十五年九月十四 · 酉初三刻 · 雁回县·北门外五里』');
});

test('来回：fromParts 与 toDate/renderTime 一致（随机 500 次）', () => {
    for (let i = 0; i < 500; i++) {
        const p = {
            year: 1 + (i % 30), month: 1 + (i % 12), day: 1 + (i % 30),
            shichen: 1 + (i % 11), ke: 1 + (i % 8),   // 避开子时跨日
        };
        const t = fromParts(p);
        assert.deepEqual(toDate(t), { year: p.year, month: p.month, day: p.day });
        assert.equal(renderTime(t), ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][p.shichen]
            + (p.ke <= 4 ? '初' : '正') + ['一', '二', '三', '四'][(p.ke <= 4 ? p.ke : p.ke - 4) - 1] + '刻');
    }
});

test('子时跨日：子初属当日，子正属次日', () => {
    const t初 = fromDate({ year: 1, month: 1, day: 2 }) + 23 * 60;
    assert.deepEqual(toDate(t初), { year: 1, month: 1, day: 2 });
    assert.equal(renderTime(t初), '子初一刻');
    const t正 = t初 + 60;
    assert.deepEqual(toDate(t正), { year: 1, month: 1, day: 3 });
    assert.equal(renderTime(t正), '子正一刻');
});

test('汉字数字', () => {
    assert.equal(cnNum(1), '一');
    assert.equal(cnNum(10), '十');
    assert.equal(cnNum(14), '十四');
    assert.equal(cnNum(27), '二十七');
});
