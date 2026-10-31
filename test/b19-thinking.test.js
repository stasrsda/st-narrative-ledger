import test from 'node:test';
import assert from 'node:assert/strict';
import { splitThinking, headerInBody, thinkingDominates, normalizeMessage, splitLooseCot, splitTailStory } from '../src/core/cleanup/thinking.js';

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

test('DeepSeek 标记：切出思考与正文', () => {
    const msg = '<｜begin▁of▁thinking｜>* 灰魂吐槽\n想到一半<｜end▁of▁thinking｜>\n\n『承平十六年九月十四 · 酉初三刻 · 某地』\n\n正文开始。';
    const r = splitThinking(msg);
    assert.equal(r.had, true);
    assert.equal(r.broken, false);
    assert.match(r.body, /正文开始/);
    assert.match(r.thinking, /灰魂吐槽/);
    assert.ok(!r.body.includes('begin'));
});

test('DeepSeek 标记：没闭合时标 broken，但不吞掉内容', () => {
    const msg = '<｜begin▁of▁thinking｜>* 灰魂吐槽\n' + '写着写着，'.repeat(20) + '\n\n　　正文从这儿开始。';
    const r = splitThinking(msg);
    assert.equal(r.broken, true);
    assert.ok(!r.body.includes('begin'), '标记要清掉');
    const n = normalizeMessage(msg);
    assert.equal(n.recovered, false, 'broken 时不该走「正文在思考里」的回填');
    assert.ok(n.body.includes('正文从这儿开始'), '正文不能被吞');
});

test('DeepSeek 标记：正常楼不受影响', () => {
    const msg = '『承平十六年九月十四』\n\n他勒马。';
    const r = splitThinking(msg);
    assert.equal(r.had, false);
    assert.equal(r.broken, false);
});

test('无标记思考：按灰魂小标题切出来', () => {
    const t = '『承平十六年九月十四』\n\n* 灰魂吐槽\n' + '   - 这段思考要够长才触发。'.repeat(12) +
        '\n\n　　他勒马停在城外。\n　　霍振在身后。';
    const r = splitLooseCot(t);
    assert.equal(r.had, true);
    assert.ok(r.thinking.includes('灰魂吐槽'));
    assert.ok(!r.body.includes('灰魂吐槽'));
    assert.ok(r.body.includes('他勒马'));
});

test('无标记思考：正文没缩进但有引号开头也认', () => {
    const t = '* 灰魂吐槽\n' + '   - 思考内容。'.repeat(20) + '\n“门洞里有人。”\n队列没有停。';
    const r = splitLooseCot(t);
    assert.equal(r.had, true);
    assert.ok(r.body.startsWith('“门洞里'));
});

test('无标记思考：正文不该被误切', () => {
    const t = '　　他勒马停在城外。\n　　霍振在身后。';
    assert.equal(splitLooseCot(t).had, false);
});

test('未闭合也尽力切：DeepSeek 开头没结尾，仍能分出正文', () => {
    const t = '<｜begin▁of▁thinking｜>* 灰魂吐槽\n' + '   - 思考内容很长。'.repeat(15) +
        '\n\n　　城墙是夯土的。\n　　霍振在身后。';
    const r = normalizeMessage(t);
    assert.equal(r.broken, true);
    assert.ok(r.body.includes('城墙是夯土的'), '正文不能被吞掉');
    assert.ok(!r.body.includes('灰魂吐槽'), '思考不该留在正文');
});

test('未闭合也尽力切：<think> 开头没结尾', () => {
    const t = '<think>* 灰魂吐槽\n' + '   - 想法。'.repeat(30) + '\n\n　　他勒马。';
    const r = normalizeMessage(t);
    assert.ok(r.body.includes('他勒马'));
});

test('尾巴正文：思考和正文都裹在一起时，按对白切开', () => {
    const think = '用户输入：白景昭下令。\n我要注意：\n- 老聂说过一句。\n- 霍振去抄家，顺带看看县丞的宅子。\n'.repeat(8);
    const story = '「三更……」老聂的喉咙里滚出半截话，手撑着地，跪直了些。\n'
        + '　　霍振把最上面一册账本翻了两页，指尖停住，往白景昭这边推过来。\n'
        + '「这不是他一个人的账。」他翻到写着字的一页，把纸角按平。\n'
        + '　　堂上没有别的声音，只有廊下的风。\n';
    const r = splitTailStory(think + story);
    assert.equal(r.had, true);
    assert.ok(r.body.includes('三更'));
    assert.ok(!r.body.includes('用户输入'));
    assert.ok(r.thinking.includes('用户输入'));
});

test('尾巴正文：正常正文不该被切', () => {
    assert.equal(splitTailStory('　　他勒马停在城外。\n　　霍振在身后。').had, false);
    // 短消息不切
    assert.equal(splitTailStory('「一句话。」').had, false);
});
