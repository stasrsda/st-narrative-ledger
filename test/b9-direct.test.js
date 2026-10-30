import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBase, pickText, requestCustom, listModels } from '../src/adapters/st/llm.js';

test('URL 归一：剥掉 /chat/completions，只留 base', () => {
    // ST 自己会拼 `${apiUrl}/chat/completions`，所以这里必须剥干净
    assert.equal(normalizeBase('https://api.siliconflow.cn/v1'), 'https://api.siliconflow.cn/v1');
    assert.equal(normalizeBase('https://api.siliconflow.cn/v1/'), 'https://api.siliconflow.cn/v1');
    assert.equal(
        normalizeBase('https://api.siliconflow.cn/v1/chat/completions'),
        'https://api.siliconflow.cn/v1',
    );
    assert.equal(
        normalizeBase('https://api.siliconflow.cn/v1/completions'),
        'https://api.siliconflow.cn/v1',
    );
    assert.equal(normalizeBase(''), '');
});

test('返回解析：几种 OpenAI 形状都能取到文本', () => {
    assert.equal(pickText({ choices: [{ message: { content: '收到' } }] }), '收到');
    assert.equal(pickText({ choices: [{ text: '收到' }] }), '收到');
    assert.equal(pickText({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }), 'ab');
    assert.equal(pickText({ content: '收到' }), '收到');
    assert.equal(pickText('收到'), '收到');
    assert.equal(pickText(null), '');
});

test('返回解析：没有 choices 时返回空串而不是崩', () => {
    assert.equal(pickText({}), '');
    assert.equal(pickText({ choices: [] }), '');
});

// ── 请求体字段：ST 服务端读 request.body.model，不是 custom_model ──
function stubContext() {
    globalThis.SillyTavern = {
        getContext: () => ({
            getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'tok' }),
        }),
    };
}

function stubFetch(reply) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(reply),
        };
    };
    return calls;
}

test('请求体字段：model / custom_url 用 base / 带 Authorization', async () => {
    stubContext();
    const calls = stubFetch({ choices: [{ message: { content: '收到' } }] });

    const out = await requestCustom({
        baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
        apiKey: 'sk-test',
        model: 'Qwen/Qwen2.5-7B-Instruct',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 32,
    });

    assert.equal(out, '收到');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/backends/chat-completions/generate');
    const b = calls[0].body;
    assert.equal(b.chat_completion_source, 'custom');
    assert.equal(b.model, 'Qwen/Qwen2.5-7B-Instruct');              // ← 关键：必须有 model
    assert.equal(b.custom_url, 'https://api.siliconflow.cn/v1');    // ← 不能带 /chat/completions
    assert.equal(b.custom_include_headers.Authorization, 'Bearer sk-test');
    assert.equal(b.stream, false);
});

test('拉取模型：走 status 端点并去重排序', async () => {
    stubContext();
    const calls = stubFetch({ data: [{ id: 'b-model' }, { id: 'a-model' }, { id: 'a-model' }] });
    const ids = await listModels({ baseUrl: 'https://api.siliconflow.cn/v1', apiKey: 'sk-test' });
    assert.deepEqual(ids, ['a-model', 'b-model']);
    assert.equal(calls[0].url, '/api/backends/chat-completions/status');
    assert.equal(calls[0].body.custom_url, 'https://api.siliconflow.cn/v1');
});

test('上游 400 时把地址和错误体带进异常', async () => {
    stubContext();
    globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        text: async () => '{"message":"model not found"}',
    });
    await assert.rejects(
        () => requestCustom({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'bad', messages: [] }),
        /HTTP 400 .*\/chat\/completions .*model not found/,
    );
});
