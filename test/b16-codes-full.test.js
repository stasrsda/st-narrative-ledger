import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { candidatesFor, renderHit } from '../src/core/codes/codes.js';

const pack = normalizePack(JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8')));
const all = [
    ...pack.codes.rites, ...pack.codes.house, ...pack.codes.laws, ...(pack.codes.procedure ?? []),
];
const ids = new Set(all.map(c => c.id));

test('四组齐备且数量足够', () => {
    assert.ok(pack.codes.rites.length >= 30, '礼应当 >= 30');
    assert.ok(pack.codes.house.length >= 20, '家法应当 >= 20');
    assert.ok(pack.codes.laws.length >= 18, '律应当 >= 18');
    assert.ok((pack.codes.procedure ?? []).length >= 25, '程序应当 >= 25');
    assert.ok(all.length >= 100, `总数应当 >= 100，现在 ${all.length}`);
});

test('id 全局唯一', () => {
    assert.equal(ids.size, all.length);
});

test('条目都有可判定的字段', () => {
    for (const c of all) {
        assert.ok(c.name, `${c.id} 缺 name`);
        assert.ok(c.brief || c.detail, `${c.id} 缺说明`);
        assert.ok(Array.isArray(c.when) && c.when.length, `${c.id} 缺 when`);
    }
});

test('脱罪与下狱：首告、连坐、恩赦、纳赎、取保、收监、开释、申详', () => {
    for (const need of ['confession_first', 'kin_liability', 'amnesty', 'redeem',
        'release', 'merit_offset', 'bail', 'detain', 'witness', 'report_up',
        'filing', 'interrogation', 'inquest', 'appeal']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
    assert.match(all.find(x => x.id === 'confession_first').detail, /全免连坐/);
});

test('冤案平反：九道程序，写清顺序', () => {
    for (const need of ['grievance', 'reopen', 'exonerate', 'restore_registry', 'posthumous',
        'rehabilitate_office', 'return_property', 'false_charge', 'impeach']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
    const ex = all.find(c => c.id === 'exonerate');
    assert.match(ex.detail, /复审得实/);
    assert.match(ex.detail, /明发上谕/);
    // 乐籍那一行销不掉
    assert.match(all.find(c => c.id === 'restore_registry').detail, /教坊司/);
});

test('骗术七条', () => {
    for (const need of ['fraud_money', 'fake_silver', 'counterfeit_doc', 'fake_official',
        'matchmaker_fraud', 'adulterate', 'abduct']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
});

test('刺杀与防护七条', () => {
    for (const need of ['assassination', 'poison', 'night_raid', 'guard_fail',
        'weapon_carry', 'manhunt', 'lockdown']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
});

test('宫中礼与府内日常都在', () => {
    for (const need of ['palace_edict', 'palace_audience', 'palace_reward', 'palace_seat',
        'palace_greeting', 'palace_curfew',
        'call_card', 'return_visit', 'audience_request', 'feast_invite', 'gift',
        'condolence', 'oath', 'sworn',
        'meal_service', 'wash_dress', 'report_duty', 'carriage', 'roll_call', 'housekeeping']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
});

test('法条都有 severity', () => {
    for (const c of pack.codes.laws) assert.ok(c.severity, `${c.id} 缺 severity`);
});

test('程序组有候选，标签渲染成「程序」', () => {
    const cs = candidatesFor(pack, { scene: 'court', rankIds: ['臣'] });
    const proc = cs.filter(c => c.kind === 'procedure');
    assert.ok(proc.length > 0);
    assert.match(renderHit(proc[0]), /^\[程序\]/);
});
