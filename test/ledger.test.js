import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, fold, foldAfterRollback, emptyState } from '../src/core/ledger/ledger.js';

test('applyEvent 不改原状态', () => {
    const s0 = emptyState();
    const s1 = applyEvent(s0, { k: 'aff', actor: 'zhiwei', delta: 5 });
    assert.equal(s0.aff.zhiwei, undefined);
    assert.equal(s1.aff.zhiwei, 5);
});

test('好感夹取上下界', () => {
    let s = emptyState();
    s = applyEvent(s, { k: 'aff', actor: 'a', delta: 500 }, { affMin: -100, affMax: 100 });
    assert.equal(s.aff.a, 100);
    s = applyEvent(s, { k: 'aff', actor: 'a', delta: -1000 }, { affMin: -100, affMax: 100 });
    assert.equal(s.aff.a, -100);
});

test('时钟与移动', () => {
    let s = emptyState();
    s = applyEvent(s, { k: 'clock', t: 1200 });
    s = applyEvent(s, { k: 'move', actor: 'user', place: 'p_wuli' });
    assert.equal(s.t, 1200);
    assert.equal(s.place, 'p_wuli');
});

test('事件打钩去重', () => {
    let s = emptyState();
    s = applyEvent(s, { k: 'event', id: 'e_break_city' });
    s = applyEvent(s, { k: 'event', id: 'e_break_city' });
    assert.deepEqual(s.done, ['e_break_city']);
});

test('折叠：按楼层累加', () => {
    const seed = { t: 0 };
    const floors = [
        { floor: 1, events: [{ k: 'clock', t: 100 }, { k: 'aff', actor: 'a', delta: 5 }] },
        { floor: 2, events: [{ k: 'aff', actor: 'a', delta: 5 }] },
        { floor: 3, events: [{ k: 'event', id: 'e_x' }] },
    ];
    const s = fold(seed, floors);
    assert.equal(s.t, 100);
    assert.equal(s.aff.a, 10);
    assert.deepEqual(s.done, ['e_x']);
});

test('回滚：丢掉指定楼层及之后', () => {
    const seed = {};
    const floors = [
        { floor: 1, events: [{ k: 'aff', actor: 'a', delta: 5 }] },
        { floor: 2, events: [{ k: 'aff', actor: 'a', delta: 5 }] },
        { floor: 3, events: [{ k: 'aff', actor: 'a', delta: 5 }] },
    ];
    assert.equal(fold(seed, floors).aff.a, 15);
    assert.equal(foldAfterRollback(seed, floors, 3).aff.a, 10);
    assert.equal(foldAfterRollback(seed, floors, 2).aff.a, 5);
    assert.equal(foldAfterRollback(seed, floors, 1).aff.a ?? 0, 0);
});

test('滑动稳定：同一批事件折叠两次结果相同', () => {
    const floors = [{ floor: 1, events: [{ k: 'aff', actor: 'a', delta: 3 }] }];
    assert.deepEqual(fold({}, floors), fold({}, floors));
});

test('授权与撤权', () => {
    let s = emptyState();
    s = applyEvent(s, { k: 'grant', holder: 'zhiwei', scope: 'ledger', rights: ['view', 'act'], source: 'appoint' });
    assert.equal(s.grants.length, 1);
    s = applyEvent(s, { k: 'revoke', holder: 'zhiwei', scope: 'ledger' });
    assert.equal(s.grants.length, 0);
});

test('自生事件与把柄', () => {
    let s = emptyState();
    s = applyEvent(s, { k: 'emergent', name: '知微夜访偏院', quote: '…' });
    s = applyEvent(s, { k: 'trace', code: 'seating', kind: 'rite', witnesses: ['xie'] });
    assert.equal(s.emergent.length, 1);
    assert.equal(s.traces.length, 1);
});

test('经济修正可挂可撤', () => {
    let s = emptyState();
    s = applyEvent(s, { k: 'econ', driver: '战事' });
    assert.equal(s.econ.length, 1);
    s = applyEvent(s, { k: 'econ_end', driver: '战事' });
    assert.equal(s.econ.length, 0);
});
