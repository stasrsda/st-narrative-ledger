// 静态检查：未声明的标识符（no-undef）
// 用 acorn 解析，自己做作用域分析；不需要装 eslint。
// 目标：把「把 A 函数的局部变量拿到 B 函数用」这类错误在提交前拦住。
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const require = createRequire(import.meta.url);

/** acorn 可能在 ST 的 node_modules 里；依次尝试 */
function loadAcorn() {
    const tries = [
        'acorn',
        'D:/Sillytavern/SillyTavern/node_modules/acorn/dist/acorn.mjs',
        'D:/Sillytavern/SillyTavern/node_modules/acorn',
    ];
    for (const t of tries) {
        try {
            if (t.endsWith('.mjs')) return require(t);
            return require(t);
        } catch { /* 下一个 */ }
    }
    return null;
}

const acorn = loadAcorn();
if (!acorn) throw new Error('找不到 acorn（检查 ST 的 node_modules）');

// 浏览器 + ST + 我们自己的全局
const GLOBALS = new Set([
    'globalThis', 'window', 'document', 'console', 'localStorage', 'sessionStorage', 'fetch',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
    'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request',
    'Response', 'AbortController', 'TextEncoder', 'TextDecoder', 'performance', 'navigator',
    'undefined', 'NaN', 'Infinity', 'arguments', 'this',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON',
    'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect',
    'Error', 'TypeError', 'RangeError', 'SyntaxError', 'parseInt', 'parseFloat', 'isNaN',
    'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'Intl',
    'ArrayBuffer', 'Uint8Array', 'Int32Array', 'Float32Array', 'DataView', 'crypto',
    'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'CustomEvent', 'Event',
    'document', 'jQuery', '$', 'toastr', 'SillyTavern', 'getContext', 'eventSource', 'event_types',
]);

function walk(node, fn, parent = null) {
    if (!node || typeof node.type !== 'string') return;
    fn(node, parent);
    for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
        const v = node[key];
        if (Array.isArray(v)) {
            for (const c of v) if (c && typeof c.type === 'string') walk(c, fn, node);
        } else if (v && typeof v.type === 'string') {
            walk(v, fn, node);
        }
    }
}

/** 从一个 pattern（形参/变量名/解构）里收集名字 */
function patternNames(node, out = []) {
    if (!node) return out;
    switch (node.type) {
        case 'Identifier': out.push(node.name); break;
        case 'ObjectPattern':
            for (const p of node.properties) {
                if (p.type === 'RestElement') patternNames(p.argument, out);
                else patternNames(p.value, out);
            }
            break;
        case 'ArrayPattern':
            for (const e of node.elements) patternNames(e, out);
            break;
        case 'RestElement': patternNames(node.argument, out); break;
        case 'AssignmentPattern': patternNames(node.left, out); break;
        default: break;
    }
    return out;
}

/** 收集一个函数/块作用域内声明的名字（不含嵌套函数体内部，但含其函数名与形参） */
function collectScope(fnNode) {
    const declared = new Set();
    const body = fnNode.body;

    const scan = (node, topLevel) => {
        if (!node || typeof node.type !== 'string') return;
        switch (node.type) {
            case 'FunctionDeclaration':
                if (node.id) declared.add(node.id.name);
                return; // 不进函数体
            case 'FunctionExpression':
            case 'ArrowFunctionExpression':
                if (node.id) declared.add(node.id.name);
                return;
            case 'ClassDeclaration':
                if (node.id) declared.add(node.id.name);
                return;
            case 'VariableDeclaration':
                for (const d of node.declarations) patternNames(d.id, []).forEach(n => declared.add(n));
                break;
            default:
                break;
        }
        for (const key of Object.keys(node)) {
            if (['type', 'start', 'end', 'loc'].includes(key)) continue;
            const v = node[key];
            if (Array.isArray(v)) {
                for (const c of v) if (c && typeof c.type === 'string') scan(c, false);
            } else if (v && typeof v.type === 'string') {
                scan(v, false);
            }
        }
    };

    if (body?.type === 'BlockStatement') {
        for (const stmt of body.body) scan(stmt, true);
    } else if (body) {
        scan(body, true);
    }
    // 形参
    for (const p of fnNode.params ?? []) patternNames(p, []).forEach(n => declared.add(n));
    return declared;
}

/**
 * 检查一段源码，返回未声明的标识符列表
 * @returns {{name:string, line:number}[]}
 */
export function lintSource(code, filename = '<inline>') {
    const ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        allowAwaitOutsideFunction: true,
    });

    const problems = [];
    const scopes = [];   // 作用域栈：Set

    const moduleScope = new Set();
    // 顶层 import / 声明
    for (const node of ast.body) {
        if (node.type === 'ImportDeclaration') {
            for (const s of node.specifiers) moduleScope.add(s.local.name);
        }
    }
    // 顶层变量与函数（粗粒度：全局扫描一遍声明）
    const globalDecls = new Set();
    walk(ast, (n) => {
        if (n.type === 'VariableDeclaration') {
            for (const d of n.declarations) patternNames(d.id, []).forEach(x => globalDecls.add(x));
        }
        if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) {
            globalDecls.add(n.id.name);
        }
    });

    const isDeclared = (name) => {
        if (GLOBALS.has(name)) return true;
        if (moduleScope.has(name)) return true;
        if (globalDecls.has(name)) return true;
        for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return true;
        return false;
    };

    const visit = (node, parent) => {
        if (!node || typeof node.type !== 'string') return;

        // 进入函数作用域
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
            || node.type === 'ArrowFunctionExpression') {
            scopes.push(collectScope(node));
            for (const p of node.params ?? []) visit(p, node);
            if (node.body) visit(node.body, node);
            scopes.pop();
            return;
        }

        switch (node.type) {
            case 'MetaProperty':
                return;
            case 'Identifier':
                // 仅当它是「引用」而不是声明/属性名/标签时检查
                if (parent) {
                    const skip = (
                        (parent.type === 'MemberExpression' && parent.property === node && !parent.computed)
                        || (parent.type === 'Property' && parent.key === node && !parent.computed)
                        || (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed)
                        || (parent.type === 'PropertyDefinition' && parent.key === node && !parent.computed)
                        || (parent.type === 'LabeledStatement' && parent.label === node)
                        || (parent.type === 'BreakStatement')
                        || (parent.type === 'ContinueStatement')
                        || (parent.type === 'ExportSpecifier')
                        || (parent.type === 'ImportSpecifier')
                        || (parent.type === 'ImportDefaultSpecifier')
                        || (parent.type === 'ImportNamespaceSpecifier')
                        || ((parent.type === 'VariableDeclarator' || parent.type === 'AssignmentPattern')
                            && parent.left === node && false)
                        || (parent.type === 'CatchClause' && parent.param === node)
                    );
                    if (!skip && !isDeclared(node.name)) {
                        problems.push({ name: node.name, line: node.loc?.start?.line ?? 0, file: filename });
                    }
                }
                return;
            case 'VariableDeclarator':
                // 只访问 init，不把声明名当引用
                if (node.init) visit(node.init, node);
                return;
            case 'CatchClause': {
                const names = new Set(patternNames(node.param, []));
                scopes.push(names);
                if (node.body) visit(node.body, node);
                scopes.pop();
                return;
            }
            case 'AssignmentPattern':
                if (node.right) visit(node.right, node);
                return;
            case 'MemberExpression':
                visit(node.object, node);
                if (node.computed) visit(node.property, node);
                return;
            case 'Property':
                if (node.computed) visit(node.key, node);
                visit(node.value, node);
                return;
            case 'ExportNamedDeclaration':
                if (node.declaration) visit(node.declaration, node);
                return;
            case 'ExportDefaultDeclaration':
                if (node.declaration) visit(node.declaration, node);
                return;
            case 'ImportDeclaration':
                return;
            default:
                break;
        }

        for (const key of Object.keys(node)) {
            if (['type', 'start', 'end', 'loc'].includes(key)) continue;
            const v = node[key];
            if (Array.isArray(v)) {
                for (const c of v) if (c && typeof c.type === 'string') visit(c, node);
            } else if (v && typeof v.type === 'string') {
                visit(v, node);
            }
        }
    };

    walk(ast, (n) => {
        if (n.type === 'Program') visit(n, null);
    }, null);
    // walk 只用来找一个 Program；实际遍历由 visit 完成
    return problems;
}

/** 递归列出目录下的 .js */
export function listJs(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) {
            if (name === 'node_modules' || name.startsWith('.')) continue;
            listJs(p, out);
        } else if (name.endsWith('.js')) {
            out.push(p);
        }
    }
    return out;
}

export function lintFiles(root, files) {
    const all = [];
    for (const f of files) {
        const code = readFileSync(f, 'utf8');
        const rel = relative(root, f).replaceAll('\\', '/');
        all.push(...lintSource(code, rel));
    }
    return all;
}
