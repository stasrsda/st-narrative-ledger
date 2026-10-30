import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { createQueue } from '../src/llm/queue.js';
import { normalizeSettle, extractJson } from '../src/llm/schema.js';
import { toEvents } from '../src/llm/settle.js';
import { reviewText, echoOfUser, summarize } from '../src/core/review/review.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

test('队列：串行执行，顺序不乱', async () => {
    const seen = [];
    const q = createQueue({ handler: async t => { seen.push(t.id); }, sleep: async () => {} });
    q.push({ id: 1 }); q.push({ id: 2 }); q.push({ id: 3 });
    await q.drain();
    assert.deepEqual(seen, [1, 2, 3]);
});

test('队列：失败重试，超过次数走 onError', async () => {
    let tries = 0;
    const errs = [];
    const q = createQueue({
        handler: async () => { tries++; throw new Error('boom'); },
        retries: 2, sleep: async () => {}, onError: e => errs.push(e.message),
    });
    q.push({});
    await q.drain();
    assert.equal(tries, 3);
    assert.equal(errs.length, 1);
});

test('队列：失败后继续处理下一个', async () => {
    const done = [];
    const q = createQueue({
        handler: async t => { if (t.bad) throw new Error('x'); done.push(t.id); },
        retries: 0, sleep: async () => {},
    });
    q.push({ id: 1 }); q.push({ id: 2, bad: true }); q.push({ id: 3 });
    await q.drain();
    assert.deepEqual(done, [1, 3]);
});

test('协议：非法 JSON 直接失败', () => {
    const r = normalizeSettle('not json');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_json');
});

test('协议：剥掉代码围栏', () => {
    const r = normalizeSettle('```json\n{"results":[]}\n```');
    assert.equal(r.ok, true);
});

test('协议：未知 kind / 未在册角色被丢弃', () => {
    const actorIds = new Set(['zhiwei']);
    const r = normalizeSettle({
        results: [
            { actor: 'zhiwei', kind: 'C' },
            { actor: 'zhiwei', kind: 'X' },
            { actor: '路人', kind: 'A' },
        ],
    }, { actorIds });
    assert.equal(r.data.results.length, 1);
    assert.equal(r.data.results[0].kind, 'C');
});

test('协议：quote 必须在正文里，找不到就清空', () => {
    const text = '她把碗放下，说：「趁热。」';
    const r = normalizeSettle({
        results: [{ actor: 'zhiwei', kind: 'A', quote: '趁热' }],
        happened: [{ name: '她端来一碗汤', quote: '编造的句子' }],
    }, { text });
    assert.equal(r.data.results[0].quote, '趁热');
    assert.equal(r.data.happened[0].quote, '');
});

test('协议：happened 只留一条', () => {
    const r = normalizeSettle({ happened: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
    assert.equal(r.data.happened.length, 1);
    assert.equal(r.data.happened[0].name, 'a');
});

test('结算 → 事件', () => {
    const state = { emergent: [], done: [] };
    const data = normalizeSettle({
        results: [{ actor: 'zhiwei', kind: 'C' }, { actor: 'huozhen', kind: 'F' }],
        codeHits: [{ id: 'seating', kind: 'rite' }],
        happened: [{ name: '她端来一碗汤' }],
        knows: [{ actor: 'zhiwei', fact: '他旧伤复发' }],
    }).data;
    const ev = toEvents(pack, state, data);
    const kinds = ev.map(e => e.k);
    assert.ok(kinds.includes('aff'));
    assert.ok(kinds.includes('trace'));
    assert.ok(kinds.includes('emergent'));
    assert.ok(kinds.includes('know'));
    const aff = ev.find(e => e.k === 'aff');
    assert.equal(aff.delta, 30);   // C 大恩
});

test('结算：F 不产生好感事件；不存在的规则不记', () => {
    const ev = toEvents(pack, {}, { results: [{ actor: 'zhiwei', kind: 'F' }], codeHits: [{ id: '瞎编' }] });
    assert.equal(ev.length, 0);
});

test('结算：同一件事不重复登记', () => {
    const state = { emergent: [{ name: '她端来一碗汤', quote: '趁热' }], done: [] };
    const ev = toEvents(pack, state, { happened: [{ name: '她端来一碗汤', quote: '趁热' }] });
    assert.equal(ev.length, 0);
});

test('审稿：缺时间头', () => {
    const f = reviewText({ text: '他走进来，坐下。' });
    assert.ok(f.some(x => x.code === 'no_header'));
});

test('审稿：好感分数外泄', () => {
    const f = reviewText({ text: '『承平元年正月初一 · 子正一刻 · 某地』\n她好感 +5 了。' });
    assert.ok(f.some(x => x.code === 'aff_leak' && x.level === 'error'));
});

test('审稿：模糊词', () => {
    const f = reviewText({ text: '『承平元年正月初一 · 子正一刻 · 某地』\n他仿佛在等。' });
    assert.ok(f.some(x => x.code === 'vague'));
});

test('审稿：复述玩家原话', () => {
    const e = echoOfUser('我说我喜欢你很久了', '她抬头。「我喜欢你很久了。」');
    assert.ok(e && '我喜欢你很久了'.includes(e));
    assert.equal(echoOfUser('嗯', '他嗯了一声'), '');
});

test('审稿：汇总', () => {
    assert.equal(summarize([]), '无异常');
    assert.match(summarize([{ level: 'error' }, { level: 'warn' }]), /1 错 \/ 1 警/);
});

test('协议：模型先输出思维链也能解析', () => {
    const r = normalizeSettle('我先想想……好的：\n{"results":[{"actor":"zhiwei","kind":"C"}]}', {
        actorIds: new Set(['zhiwei']),
    });
    assert.equal(r.ok, true);
    assert.equal(r.data.results.length, 1);
});

test('协议：字符串里的花括号不会切断解析', () => {
    const r = normalizeSettle('思考。{"results":[{"actor":"zhiwei","kind":"B","note":"她说{好}"}]}', {
        actorIds: new Set(['zhiwei']),
    });
    assert.equal(r.ok, true);
    assert.equal(r.data.results[0].note, '她说{好}');
});

test('extractJson：没有对象时返回 null', () => {
    assert.equal(extractJson('这一轮没什么事'), null);
});
