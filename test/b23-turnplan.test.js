import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnMessages, validateTurnPlan, renderTurnPlan } from '../src/llm/turnPlan.js';

const resolvePlace = (n) => (n === '沈宅' ? { id: 'p_shenzhai', name: '沈宅' } : null);
const knownCodes = new Set(['interrogation', 'seating']);

test('请求里带上现在的时间地点、玩家原话、可选地点', () => {
    const m = buildTurnMessages({
        userText: '次日去沈宅',
        placeName: '县衙',
        onstage: ['霍振'],
        places: ['县衙', '沈宅'],
        ruleOutline: '<导演>场:县衙</导演>',
        recent: '城破',
        timeText: '承平十六年九月十四 · 戌正',
    });
    assert.equal(m.length, 2);
    const u = m[1].content;
    assert.match(u, /县衙/);
    assert.match(u, /沈宅/);
    assert.match(u, /次日去沈宅/);
    assert.match(u, /承平十六年九月十四/);
});

test('校验：分钟夹取、地点只认名单、礼法只认已知 id', () => {
    const plan = validateTurnPlan(
        { minutes: 99999, place: '不存在的城', codes: ['interrogation', 'nope'], beats: [{ who: '霍振', do: '退半步' }], hook: '门外一声响' },
        { resolvePlace, knownCodes },
    );
    assert.equal(plan.minutes, 3 * 1440, '上限三天');
    assert.equal(plan.place, null, '不认识的地名丢掉');
    assert.deepEqual(plan.codes, ['interrogation']);
    assert.equal(plan.beats.length, 1);
    assert.equal(plan.ok, true);
});

test('校验：负分钟归零，坏数据不崩', () => {
    assert.equal(validateTurnPlan({ minutes: -50 }).minutes, 0);
    assert.equal(validateTurnPlan(null).ok, false);
    assert.equal(validateTurnPlan({ beats: [] }).ok, false);
});

test('校验：地点能认出来就给 id', () => {
    const plan = validateTurnPlan({ place: '沈宅', beats: [{ who: '霍振', do: '敲门' }] }, { resolvePlace });
    assert.deepEqual(plan.place, { id: 'p_shenzhai', name: '沈宅' });
});

test('渲染：推进/换场/编排/钩子都写进大纲', () => {
    const text = renderTurnPlan('<导演>场:县衙</导演>', {
        minutes: 1440, place: { id: 'p_shenzhai', name: '沈宅' },
        beats: [{ who: '霍振', do: '退半步' }], hook: '门外一声响',
    });
    assert.match(text, /时间推进:1440/);
    assert.match(text, /换场:沈宅/);
    assert.match(text, /霍振：退半步/);
    assert.match(text, /留:门外一声响/);
});
