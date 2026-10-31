// 角色槽的测试（纯逻辑，不需要 ST）
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_DEFS, resolveRole, describeRoles, withTimeout } from '../src/model/roles.js';

const direct = {
    direct: { baseUrl: 'https://api.siliconflow.cn/v1', apiKey: 'sk-test', model: 'Qwen/Qwen2.5-7B-Instruct' },
    profileId: '',
};

test('默认：planner 用 14B，settler 用 7B', () => {
    assert.equal(resolveRole(direct, 'planner').model, 'Qwen/Qwen2.5-14B-Instruct');
    assert.equal(resolveRole(direct, 'settler').model, 'Qwen/Qwen2.5-7B-Instruct');
});

test('deliberator 没配模型时继承 planner', () => {
    const r = resolveRole(direct, 'deliberator');
    assert.equal(r.model, 'Qwen/Qwen2.5-14B-Instruct');
    assert.equal(r.via, 'direct');
});

test('角色可以单独指定模型与超时', () => {
    const s = {
        ...direct,
        roles: { settler: { model: 'THUDM/GLM-4-9B-0414', timeoutMs: 3000, maxTokens: 200 } },
    };
    const r = resolveRole(s, 'settler');
    assert.equal(r.model, 'THUDM/GLM-4-9B-0414');
    assert.equal(r.timeoutMs, 3000);
    assert.equal(r.maxTokens, 200);
});

test('没有直连也给了连接配置 → 走 profile', () => {
    const s = { direct: {}, profileId: 'fu' };
    const r = resolveRole(s, 'settler');
    assert.equal(r.via, 'profile');
    assert.equal(r.profileId, 'fu');
});

test('什么都没有 → null（调用方自己降级）', () => {
    assert.equal(resolveRole({ direct: {}, profileId: '' }, 'settler'), null);
    assert.equal(resolveRole(direct, '不存在的角色'), null);
});

test('describeRoles 给出每个角色的落点', () => {
    const list = describeRoles(direct);
    assert.equal(list.length, Object.keys(ROLE_DEFS).length);
    assert.ok(list.every(x => x.model && x.via));
});

test('withTimeout：超时返回兜底值', async () => {
    const slow = new Promise(r => setTimeout(() => r('done'), 200));
    assert.equal(await withTimeout(slow, 30, 'timeout'), 'timeout');
    assert.equal(await withTimeout(Promise.resolve('ok'), 50, 'timeout'), 'ok');
});
