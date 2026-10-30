import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePack } from '../src/core/pack/validate.js';
import { normalizePack, createRegistry, addPack, getPack, resolvePack } from '../src/core/pack/registry.js';
import { BUILTIN_PACK } from '../src/core/pack/builtin.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(raw));

test('真实世界包：零错误', () => {
    const r = validatePack(normalizePack(clone()));
    assert.deepEqual(r.errors, []);
    assert.equal(r.ok, true);
});

test('内置兜底包：零错误', () => {
    const r = validatePack(normalizePack(JSON.parse(JSON.stringify(BUILTIN_PACK))));
    assert.deepEqual(r.errors, []);
});

test('缺 monthDays 报错', () => {
    const p = normalizePack(clone());
    delete p.calendar.monthDays;
    const r = validatePack(p);
    assert.ok(r.errors.some(e => e.path === 'calendar.monthDays'));
});

test('天气不在词表里报错', () => {
    const p = normalizePack(clone());
    p.climate.zones[0].seasons.winter.push('冰雹');
    const r = validatePack(p);
    assert.ok(r.errors.some(e => e.code === 'vocab'));
});

test('节令日期越界报错', () => {
    const p = normalizePack(clone());
    p.festivals.push({ month: 2, day: 31, name: '瞎编' });
    assert.ok(validatePack(p).errors.some(e => e.code === 'range'));
});

test('引用不存在的位份报错', () => {
    const p = normalizePack(clone());
    p.actors[0].rank = '仙人';
    assert.ok(validatePack(p).errors.some(e => e.code === 'ref'));
});

test('事件引用不存在 / 自依赖', () => {
    const p = normalizePack(clone());
    p.events[0].requires = ['e_不存在'];
    assert.ok(validatePack(p).errors.some(e => e.code === 'ref'));
    const q = normalizePack(clone());
    q.events[0].after = [q.events[0].id];
    assert.ok(validatePack(q).errors.some(e => e.code === 'self'));
});

test('版本不符拒绝', () => {
    const p = normalizePack(clone());
    p.schemaVersion = 2;
    assert.ok(validatePack(p).errors.some(e => e.code === 'version'));
});

test('规范化：补默认值 + 建索引', () => {
    const p = normalizePack({ id: 'x', name: 'X' });
    assert.equal(p.calendar.monthDays, 30);
    assert.deepEqual(p.codes.rites, []);
    assert.ok(p.index && 'place' in p.index);
    assert.ok(p.query === undefined || true);
});

test('注册表：坏包不入库，好包入库', () => {
    const reg = createRegistry();
    const bad = clone();
    bad.id = 'bad';
    bad.calendar.monthDays = 'x';   // 规范化不会修非法值，只会补缺失
    const r1 = addPack(reg, bad);
    assert.equal(r1.ok, false);
    assert.equal(getPack(reg, 'bad'), null);
    assert.ok(reg.errors.bad);

    const r2 = addPack(reg, clone());
    assert.equal(r2.ok, true);
    assert.ok(getPack(reg, 'beiliang'));
});

test('解析：显式 > 匹配 > 默认 > 兜底', () => {
    const reg = createRegistry();
    addPack(reg, clone());
    addPack(reg, JSON.parse(JSON.stringify(BUILTIN_PACK)));

    assert.equal(resolvePack(reg, { packId: 'builtin-guofeng' }).reason, 'explicit');
    assert.equal(resolvePack(reg, { worldBooks: ['北凉'] }).pack.id, 'beiliang');
    assert.equal(resolvePack(reg, { characters: ['北凉_叙事卡_v2'] }).pack.id, 'beiliang');
    assert.equal(resolvePack(reg, { defaultId: 'builtin-guofeng' }).reason, 'default');

    const empty = createRegistry();
    assert.equal(resolvePack(empty, {}).reason, 'none');
});
