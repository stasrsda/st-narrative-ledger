import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { rankCodes, retrieveCodes } from '../src/core/codes/retrieve.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));

test('检索：堂审场景优先给律与程序', () => {
    const got = retrieveCodes(pack, {
        scene: 'court',
        rankIds: ['囚', '臣'],
        text: '沈知微跪在堂下，状纸递上，问官拍了惊堂木。',
    }, 8);
    assert.ok(got.length > 0);
    const kinds = got.map(c => c.kind);
    assert.ok(kinds.includes('procedure') || kinds.includes('law'), '应当有律或程序');
});

test('检索：内宅场景优先给礼与家法', () => {
    const got = retrieveCodes(pack, {
        scene: 'inner_court',
        rankIds: ['妾', '正妃'],
        text: '请安时妾先向正妃福身，再向侧妃福身，坐下首。',
    }, 8);
    assert.ok(got.some(c => c.kind === 'rite' || c.kind === 'house'));
    assert.ok(got.some(c => c.id === 'morning_greeting' || c.id === 'seating'));
});

test('检索：寝殿病发会带上侍疾与请医', () => {
    const got = retrieveCodes(pack, {
        scene: 'bedroom', rankIds: ['王', '仆'], text: '夜里王爷病发，赵伯进来试了药。',
    }, 10);
    const ids = got.map(c => c.id);
    assert.ok(ids.includes('nursing') || ids.includes('sick_call') || ids.includes('convalesce'));
});

test('检索：市面提到盐引会带上商法', () => {
    const got = retrieveCodes(pack, {
        scene: 'market', rankIds: ['客'], text: '崔掌柜说盐引不够，抽分又加了一成。',
    }, 8);
    const ids = got.map(c => c.id);
    assert.ok(ids.includes('salt_cert') || ids.includes('market_tax'));
});

test('检索：结果不超过 limit', () => {
    for (const limit of [3, 8, 10]) {
        assert.ok(retrieveCodes(pack, { scene: 'inner_court', rankIds: ['妾'], text: '请安' }, limit).length <= limit);
    }
});

test('检索：最近命中过的同一条会被降权', () => {
    const base = rankCodes(pack, { scene: 'court', rankIds: ['臣'], text: '状纸 惊堂木' });
    const avoided = rankCodes(pack, {
        scene: 'court', rankIds: ['臣'], text: '状纸 惊堂木',
        state: { traces: base.slice(0, 3).map(x => ({ code: x.code.id })) },
    });
    const topBefore = base[0].code.id;
    const posAfter = avoided.findIndex(x => x.code.id === topBefore);
    assert.ok(posAfter !== 0, '刚命中过的规则不该还排第一');
});

test('检索：全部来自包里，不会凭空生成', () => {
    const all = new Set([
        ...pack.codes.rites, ...pack.codes.house, ...pack.codes.laws,
        ...(pack.codes.procedure ?? []), ...(pack.codes.clan ?? []),
    ].map(c => c.id));
    for (const c of retrieveCodes(pack, { scene: 'hall', rankIds: ['妾'], text: '宴席' }, 10)) {
        assert.ok(all.has(c.id));
    }
});
