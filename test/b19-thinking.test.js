import test from 'node:test';
import assert from 'node:assert/strict';
import { splitThinking, headerInBody, thinkingDominates, normalizeMessage } from '../src/core/cleanup/thinking.js';

test('拆出 <思考> 块', () => {
    const r = splitThinking('<思考>我要写时间头『某日』然后正文</思考>\n正文第一句。');
    assert.equal(r.had, true);
    assert.equal(r.body, '正文第一句。');
    assert.match(r.thinking, /我要写/);
});

test('拆出 ```think 代码块', () => {
    const r = splitThinking('```think\n先想想\n```\n\n『承平十六年九月十四』\n正文');
    assert.equal(r.had, true);
    assert.match(r.body, /承平十六年九月十四/);
    assert.ok(!r.body.includes('先想想'));
});

test('没有思考块时原文不变', () => {
    const src = '『承平十六年九月十四 · 酉初三刻 · 北门外五里』\n\n他勒马。';
    const r = splitThinking(src);
    assert.equal(r.had, false);
    assert.equal(r.body.trim(), src.trim());
});

test('正文里没有时间头时不误判', () => {
    const r = splitThinking('<思考>时间头写在正文最前面『某日』</思考>\n只有正文，没有时间头。');
    assert.equal(headerInBody(r.body), false);
    assert.equal(headerInBody('『承平十六年九月十四』\n正文'), true);
});

test('思考比正文长很多时告警', () => {
    assert.equal(thinkingDominates('想'.repeat(1000), '写'.repeat(100)), true);
    assert.equal(thinkingDominates('想'.repeat(100), '写'.repeat(500)), false);
});

test('思考块里的时间头不会被拿去解析', () => {
    const msg = '<思考>先写『承平十六年九月十四 · 酉初三刻 · 某地』再写正文</思考>\n\n他勒马停在城外五里。';
    const r = splitThinking(msg);
    assert.ok(!r.body.includes('承平'));
});

test('正文回收：正文在思考块里时提回来', () => {
    const msg = '<思考>『承平十六年九月十四 · 酉初三刻 · 北门外五里』\n\n他勒马停在城外，看那面烧掉的旗。霍振在身后半步。</思考>\n\n';
    const r = normalizeMessage(msg);
    assert.equal(r.recovered, true);
    assert.match(r.body, /承平十六年九月十四/);
    assert.match(r.body, /霍振/);
});

test('正文回收：正常消息不动', () => {
    const msg = '<思考>先想想这局该怎么走。</思考>\n\n『承平十六年九月十四』\n\n他勒马。';
    const r = normalizeMessage(msg);
    assert.equal(r.recovered, false);
    assert.match(r.body, /他勒马/);
});

test('正文回收：正文没时间头而思考里有，把时间头并回开头', () => {
    const msg = '<思考>『承平十六年九月十四 · 酉初三刻 · 某地』</思考>\n\n他站在廊下，听雨声一阵一阵落下来，把这院子的土都泡软了。';
    const r = normalizeMessage(msg);
    assert.equal(r.recovered, true);
    assert.match(r.body.split('\n')[0], /承平十六年九月十四/);
    assert.match(r.body, /廊下/);
});
