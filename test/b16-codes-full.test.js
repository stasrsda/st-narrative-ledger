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
    assert.ok(pack.codes.laws.length >= 35, '律应当 >= 35');
    assert.ok((pack.codes.procedure ?? []).length >= 33, '程序应当 >= 33');
    assert.ok(all.length >= 140, `总数应当 >= 140，现在 ${all.length}`);
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

test('柳家案的原点：漕粮亏空与仓场舞弊都在', () => {
    for (const need of ['granary_check', 'grain_deficit', 'grain_fraud', 'transport_loss']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
    assert.match(all.find(c => c.id === 'grain_deficit').detail, /柳家/);
});

test('平反之后的收尾：放还家口、退婚、复考、乡评、卷宗失踪', () => {
    for (const need of ['family_return', 'broken_betrothal', 'exam_restore',
        'public_opinion', 'missing_file']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
    assert.match(all.find(c => c.id === 'missing_file').detail, /三处都不见/);
});

test('骗术加深：假僧道、冒认亲族、一房两卖、赌局、庸医', () => {
    for (const need of ['fake_monk', 'fake_kin', 'double_sale', 'gambling_cheat', 'quack']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
});

test('刺杀加深：弓弩、围车、火油、内应、病发遇袭、替身绕道、封城', () => {
    for (const need of ['crossbow_ambush', 'coach_trap', 'fire_oil', 'inside_traitor',
        'sick_ambush', 'decoy_route', 'city_seal']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
});

test('病发遇袭写清了「赵伯在内、亲卫在外」', () => {
    const c = all.find(x => x.id === 'sick_ambush');
    assert.match(c.detail, /赵伯/);
});

test('商法：盐引、茶马、抽分、度量衡、囤积、走私、欠债、契约、合伙、字号、番商、行会', () => {
    for (const need of ['salt_cert', 'tea_horse', 'market_tax', 'weights_measures',
        'price_gouge', 'smuggle_route', 'debt', 'contract', 'partnership',
        'fake_brand', 'barbarian_trade', 'guild_rule']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
});

test('盐引写清了「盐不认人，认引」', () => {
    assert.match(all.find(c => c.id === 'salt_cert').brief, /认引/);
});

test('走私写清了「世家要削他的兵，根子在这」', () => {
    assert.match(all.find(c => c.id === 'smuggle_route').detail, /世家/);
});

test('合伙写清了王爷出本、崔掌柜出面、账在孙账房', () => {
    const c = all.find(x => x.id === 'partnership');
    assert.match(c.detail, /崔掌柜/);
    assert.match(c.detail, /孙账房/);
});

test('府制仪礼：府制、服色、进献、宗室、阅兵、巡边、营造、账簿', () => {
    for (const need of ['mansion_rank', 'formal_dress', 'tribute', 'clan_visit',
        'martial_review', 'border_patrol', 'mansion_build', 'household_ledger']) {
        assert.ok(ids.has(need), `缺 ${need}`);
    }
    assert.match(all.find(c => c.id === 'border_patrol').detail, /谁也不许问/);
});
