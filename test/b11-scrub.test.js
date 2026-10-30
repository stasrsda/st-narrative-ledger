import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubText, scrubMessages } from '../src/core/cleanup/scrub.js';

test('清掉 <好感> 块', () => {
    const r = scrubText('正文一句。\n<好感>霍振：65</好感>');
    assert.equal(r.removed, 1);
    assert.equal(r.text, '正文一句。');
});

test('清掉【在场】行', () => {
    const r = scrubText('『某日』\n【在场】霍振、沈知微\n正文');
    assert.equal(r.removed, 1);
    assert.ok(!r.text.includes('【在场】'));
    assert.ok(r.text.includes('正文'));
});

test('清掉误写进正文的状态块', () => {
    const t = '[状态·只读·勿复述]\n时:某日\n在场:霍振\n与<info>冲突时以本块为准。\n正文开始';
    const r = scrubText(t);
    assert.equal(r.removed, 1);
    assert.ok(r.text.startsWith('正文开始'));
});

test('正常正文不动', () => {
    const src = '『承平十六年九月十四 · 酉初三刻 · 北门外五里』\n\n他勒马停在城外。';
    const r = scrubText(src);
    assert.equal(r.removed, 0);
    assert.equal(r.text.trim(), src.trim());
});

test('批量清理：统计楼数与处数', () => {
    const msgs = [
        { mes: '正常' },
        { mes: '正文<好感>甲：1</好感>' },
        { mes: '【在场】霍振\n正文' },
    ];
    const r = scrubMessages(msgs);
    assert.equal(r.messages, 2);
    assert.equal(r.blocks, 2);
    assert.equal(msgs[1].mes, '正文');
});
