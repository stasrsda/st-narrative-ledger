import test from 'node:test';
import assert from 'node:assert/strict';
import { urgencyAt, urgencyLine } from '../src/core/clock/urgency.js';
import { fromParts } from '../src/core/calendar/guofeng.js';

const t = (shichen) => fromParts({ year: 16, month: 9, day: 14, shichen, ke: 4 });

test('紧迫度：夜里算到天亮，白天算到天黑', () => {
    // SHICHEN: 0=子 3=卯 6=午 9=酉 11=亥
    assert.equal(urgencyAt(t(0)).kind, 'dawn');
    assert.equal(urgencyAt(t(6)).kind, 'dusk');
    assert.equal(urgencyAt(t(11)).kind, 'dawn');
});

test('紧迫度：文案是人话', () => {
    // 子时（0）离天亮最近；午时（6）离天黑最近
    assert.match(urgencyLine(t(0)), /距(天亮|天黑)还有/);
    assert.match(urgencyLine(t(6)), /距(天亮|天黑)还有/);
    assert.ok(!/\d+\.\d/.test(urgencyLine(t(6))), '不该出现小数');
    assert.ok(!/\d+ 小时/.test(urgencyLine(t(6))), '不该出现「小时」');
});

test('紧迫度：剩余时间随时间减少（同一天内）', () => {
    const a = urgencyAt(t(4)).minutes;
    const b = urgencyAt(t(6)).minutes;
    assert.ok(a > b, `${a} 应大于 ${b}`);
});
