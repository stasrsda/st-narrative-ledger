import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOfficials, officialToGrants, describeGrant } from '../src/core/authority/autogrant.js';

const known = new Set(['霍振', '赵伯', '沈知微']);

test('职位在前：兵部侍郎周崇', () => {
    const r = detectOfficials('殿外站着兵部侍郎周崇，他没进来。', { knownNames: known });
    assert.equal(r.length, 1);
    assert.equal(r[0].name, '周崇');
    assert.equal(r[0].title, '兵部侍郎');
});

test('名字在前：户部尚书沈述', () => {
    const r = detectOfficials('来人是户部尚书沈述，递了帖子。', { knownNames: known });
    assert.ok(r.some(o => o.name === '沈述'));
});

test('已知角色不再登记', () => {
    const r = detectOfficials('霍振是副将。', { knownNames: known });
    assert.equal(r.length, 0);
});

test('虚词不当名字：旁边是 / 殿外站着 / 小六子的', () => {
    const r = detectOfficials('旁边是节度使的旧部；有个叫小六子的亲卫跑进来。', { knownNames: known });
    for (const o of r) {
        assert.ok(!/[的了着是在个的叫]/.test(o.name), `不该把「${o.name}」当名字`);
    }
});

test('转成 grant 事件：带来源', () => {
    const [o] = detectOfficials('兵部侍郎周崇来了。', { knownNames: known });
    const gs = officialToGrants(o);
    assert.ok(gs.length >= 1);
    assert.equal(gs[0].k, 'grant');
    assert.equal(gs[0].holder, '周崇');
    assert.match(gs[0].source, /兵部侍郎/);
});

test('可读文本', () => {
    const t = describeGrant({ holder: '周崇', scope: 'army', rights: ['view'] }, s => ({ army: '军务', court: '朝议' }[s] ?? s));
    assert.equal(t, '周崇 军务（查看）');
});

test('最多三条，不重复', () => {
    const text = '兵部侍郎周崇、户部尚书沈述、刑部侍郎李默、礼部侍郎王崇，四个人都在。';
    const r = detectOfficials(text, { knownNames: known, limit: 3 });
    assert.ok(r.length <= 3);
    const names = r.map(o => o.name);
    assert.equal(new Set(names).size, names.length);
});
