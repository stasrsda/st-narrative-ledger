// 静态检查作为测试：未声明的标识符 = 0 才算通过
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lintFiles, listJs } from '../tools/lint-undef.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('静态检查：没有未声明的标识符（no-undef）', () => {
    const files = [join(root, 'index.js'), ...listJs(join(root, 'src'))];
    const problems = lintFiles(root, files);
    const detail = problems
        .slice(0, 10)
        .map(p => `${p.file}:${p.line} ${p.name}`)
        .join('\n');
    assert.equal(problems.length, 0, `发现未声明的标识符：\n${detail}`);
});

test('静态检查：扫描到的文件数合理（防止路径写错导致 0 个文件）', () => {
    const files = [join(root, 'index.js'), ...listJs(join(root, 'src'))];
    assert.ok(files.length > 30, `只扫到 ${files.length} 个文件`);
});

test('不整页重绘：源码里不该再对每条消息调 printMessages 冲掉别的扩展按钮', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync(join(root, 'index.js'), 'utf8');
    // 只允许「兜底」那一次（找不到目标楼层时）
    const codeLines = code
        .split('\n')
        .filter(l => !/^\s*(\*|\/\/)/.test(l))
        .filter(l => l.includes('printMessages'));
    assert.ok(codeLines.length <= 3, `printMessages 在代码里出现 ${codeLines.length} 处：\n${codeLines.join('\n')}`);
});
