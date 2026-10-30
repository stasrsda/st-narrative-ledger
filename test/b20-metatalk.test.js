import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewText } from '../src/core/review/review.js';

test('正文里的「被截断了」会被标为 meta_talk', () => {
    const f = reviewText({ text: '『承平十六年九月十四 · 酉初三刻 · 某地』\n他把刀横在膝上——被截断了。接着又写。' });
    assert.ok(f.some(x => x.code === 'meta_talk'), '应当报 meta_talk');
});

test('正常的「断」不误报', () => {
    const f = reviewText({ text: '『承平十六年九月十四 · 酉初三刻 · 某地』\n刀断了，他捡起来看了看。' });
    assert.ok(!f.some(x => x.code === 'meta_talk'), '不该误报');
});

test('「字数不够」「我需要继续」也认', () => {
    for (const t of ['字数不够，我再写一点。', '我需要继续写下去。', '这段太短了。']) {
        const f = reviewText({ text: '『某日 · 某地』\n' + t });
        assert.ok(f.some(x => x.code === 'meta_talk'), `应当报：${t}`);
    }
});
