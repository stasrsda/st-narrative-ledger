import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePack } from '../src/core/pack/registry.js';
import { can, whoCan, grant, revoke, grantLine, dispatchHint } from '../src/core/authority/grants.js';
import { candidatesFor, renderHit, renderReact } from '../src/core/codes/codes.js';
import { gazeOf, postureOf, gazeLine, crowdLine } from '../src/core/gaze/gaze.js';

const raw = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const pack = normalizePack(raw);

test('职权：高低包含关系', () => {
    const g = [{ holder: 'zhiwei', scope: 'ledger', rights: ['act'], source: 'appoint' }];
    assert.equal(can(g, 'zhiwei', 'ledger', 'act'), true);
    assert.equal(can(g, 'zhiwei', 'ledger', 'view'), true);   // act 含 view
    assert.equal(can(g, 'zhiwei', 'ledger', 'delegate'), false);
    assert.equal(can(g, 'huozhen', 'ledger', 'view'), false);
});

test('职权：通配与本院', () => {
    const g = [{ holder: 'a', scope: '*', rights: ['view'] }];
    assert.equal(can(g, 'a', 'ledger', 'view'), true);
    assert.equal(can(g, 'a', 'p_wf_dong', 'view'), true);
});

test('授权、撤权、查人', () => {
    let g = [];
    g = grant(g, { holder: 'zhiwei', scope: 'ledger', rights: ['view', 'act'] });
    assert.deepEqual(whoCan(g, 'ledger', 'act'), ['zhiwei']);
    g = grant(g, { holder: 'zhiwei', scope: 'ledger', rights: ['view'] });   // 覆盖
    assert.equal(can(g, 'zhiwei', 'ledger', 'act'), false);
    g = revoke(g, 'zhiwei', 'ledger');
    assert.equal(can(g, 'zhiwei', 'ledger', 'view'), false);
});

test('授权行与请示提示', () => {
    const g = [{ holder: 'zhiwei', scope: 'ledger', rights: ['view', 'act'], source: 'appoint' }];
    assert.equal(grantLine(g[0]), 'zhiwei 账目（查看·处置）');
    assert.equal(dispatchHint(g, 'ledger', 'zhiwei'), '可自行处置');
    assert.equal(dispatchHint(g, 'ledger', 'huozhen'), '须请示');
});

test('礼法候选：内宅请安', () => {
    const list = candidatesFor(pack, {
        scene: 'inner_court',
        rankIds: ['正妃', '侧妃', '妾', '通房'],
        household: { hasMistress: true },
    });
    const ids = list.map(c => c.id);
    assert.ok(ids.includes('morning_greeting'));
    assert.ok(ids.includes('seating'));
    assert.ok(!ids.includes('no_mistress'));   // 有主母时不该出现
});

test('礼法候选：无主母时反过来了', () => {
    const list = candidatesFor(pack, {
        scene: 'inner_court',
        rankIds: ['通房', '妾'],
        household: { hasMistress: false },
    });
    const ids = list.map(c => c.id);
    assert.ok(ids.includes('no_mistress'));
    assert.ok(!ids.includes('morning_greeting'));
});

test('礼法候选：不在场的人不触发', () => {
    const list = candidatesFor(pack, { scene: 'inner_court', rankIds: ['臣'], household: { hasMistress: true } });
    assert.ok(!list.map(c => c.id).includes('seating'));
});

test('命中渲染', () => {
    const code = candidatesFor(pack, { scene: 'inner_court', rankIds: ['妾'], household: { hasMistress: true } })
        .find(c => c.id === 'seating');
    assert.match(renderHit(code), /^\[礼\] 座次违制/);
    assert.match(renderReact(code), /^\[反应\]/);
});

test('观感：四轴合成（朝臣 + 人屠 + 腿废）', () => {
    const g = gazeOf(pack, { stance: 'capital_official', knows: ['butcher', 'crippled'] });
    // 基础 0/2/-1/1；butcher +2畏 +1敬 -1近；crippled +1轻 -1畏
    assert.equal(g.respect, 1);
    assert.equal(g.fear, 3);
    assert.equal(g.closeness, -2);
    assert.equal(g.contempt, 2);
});

test('观感：畏高则跪，敬高则敢直视', () => {
    const timid = postureOf(pack, { stance: 'capital_folk', knows: ['butcher'], temper: 'timid' });
    assert.match(timid.posture, /跪|退到墙边/);

    const oldSoldier = postureOf(pack, { stance: 'beiliang_old', knows: ['protects_men', 'saved_emperor'], temper: 'upright' });
    assert.match(oldSoldier.eye, /直视|敢/);
});

test('观感行与群众', () => {
    const line = gazeLine(pack, { stance: 'capital_official', temper: 'sly', knows: ['butcher'] });
    assert.match(line, /朝臣/);
    assert.match(line, /滑头/);
    assert.equal(crowdLine(pack, [
        { stance: 'beiliang_folk' }, { stance: 'beiliang_folk' }, { stance: 'capital_folk' },
    ]), '北凉百姓2人、京城百姓1人');
});
