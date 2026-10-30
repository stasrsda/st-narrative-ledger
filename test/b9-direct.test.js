import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBase, pickText } from '../src/adapters/st/llm.js';

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
