import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { parsePresence, stripPresence, resolveActors, renderPresence } from '../src/core/clock/presence.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

test('解析：中文顿号与逗号都行', () => {
    assert.deepEqual(parsePresence('前半\n【在场】霍振、沈知微\n正文'), ['霍振', '沈知微']);
    assert.deepEqual(parsePresence('【在场】霍振,沈知微'), ['霍振', '沈知微']);
});

test('解析：没有这一行返回 null，写了空的返回空数组', () => {
    assert.equal(parsePresence('只有正文，没有在场行'), null);
    assert.deepEqual(parsePresence('【在场】'), []);
});

test('解析：去掉「无」这类占位', () => {
    assert.deepEqual(parsePresence('【在场】无'), []);
});

test('名字 → id：精确与包含', () => {
    assert.deepEqual(resolveActors(pack, ['霍振']).ids, ['huozhen']);
    assert.deepEqual(resolveActors(pack, ['沈知微']).ids, ['zhiwei']);
    const loose = resolveActors(pack, ['知微']);
    assert.deepEqual(loose.ids, ['zhiwei']);
});

test('名字 → id：认不出的单独列出', () => {
    const r = resolveActors(pack, ['霍振', '路人甲']);
    assert.deepEqual(r.ids, ['huozhen']);
    assert.deepEqual(r.unknown, ['路人甲']);
});

test('去掉在场行', () => {
    const t = '『某日』\n【在场】霍振\n正文开始';
    assert.equal(stripPresence(t), '『某日』\n正文开始');
});

test('渲染在场行', () => {
    assert.equal(renderPresence(pack, ['huozhen', 'zhiwei']), '【在场】霍振、沈知微');
});
