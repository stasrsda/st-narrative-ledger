// 礼法场景门：夜访只在卧房，问案只在公堂/牢房
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { codeAllowedAt } from '../src/core/codes/gate.js';
import { toEvents } from '../src/llm/settle.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));
const code = (id) => pack.index.code[id];

test('场景门：夜访只在卧房', () => {
    assert.equal(codeAllowedAt(code('night_visit'), 'bedroom'), true);
    assert.equal(codeAllowedAt(code('night_visit'), 'roadside'), false);
    assert.equal(codeAllowedAt(code('night_visit'), 'court'), false);
});

test('场景门：问案只在公堂/牢房', () => {
    assert.equal(codeAllowedAt(code('interrogation'), 'court'), true);
    assert.equal(codeAllowedAt(code('interrogation'), 'prison'), true);
    assert.equal(codeAllowedAt(code('interrogation'), 'bedroom'), false);
});

test('场景门：没写场景约束的礼法不拦', () => {
    const bare = { id: 'x', when: ['夜'] };
    assert.equal(codeAllowedAt(bare, 'street'), true);
    assert.equal(codeAllowedAt({ id: 'y' }, null), true);
});

test('结算：城门口提到夜访不会记账', () => {
    const state = { done: [], emergent: [] };
    const data = { codeHits: [{ id: 'night_visit' }, { id: 'interrogation' }] };
    const atGate = toEvents(pack, state, data, { scene: 'roadside' });
    assert.equal(atGate.filter(e => e.k === 'trace').length, 0, '城门口两个都不该记');

    const atCourt = toEvents(pack, state, data, { scene: 'court' });
    assert.deepEqual(atCourt.map(e => e.code), ['interrogation']);
});
