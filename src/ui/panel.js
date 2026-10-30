import { VERSION, BUILD, PANEL_ID } from '../core/version.js';

const TABS = [
    ['state', '状态'],
    ['events', '事件'],
    ['items', '物品'],
    ['pack', '世界包'],
    ['review', '审稿'],
];

const S = {
    tab: 'state',
    chatId: '',
    messageCount: 0,
    packId: '—',
    packName: '',
    injected: false,
    tokens: 0,
    dropped: [],
    block: '',
    pending: [],
    done: [],
    items: [],
    review: [],
    transport: '未接',
    profileId: '',
    env: null,
    packs: [],
    openingLabel: '',
    profiles: [],
    packError: '',
    testResult: null,
};

let profileHandler = null;
let resetHandler = null;
let packHandler = null;
let saveHandler = null;
let testHandler = null;

export function onProfileChange(fn) {
    profileHandler = fn;
}

export function onReset(fn) {
    resetHandler = fn;
}

export function onPackChange(fn) {
    packHandler = fn;
}

export function onSaveProfile(fn) {
    saveHandler = fn;
}

export function onTestModel(fn) {
    testHandler = fn;
}

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function row(k, v) {
    const line = el('div', 'sl-row');
    line.append(el('span', 'sl-k', k));
    line.append(el('span', 'sl-v', v == null || v === '' ? '—' : String(v)));
    return line;
}

function card(title) {
    const c = el('div', 'sl-card');
    if (title) c.append(el('div', 'sl-card-title', title));
    return c;
}

/** 弹窗结构：遮罩 + 居中对话框 */
function buildModal() {
    const modal = el('div', 'story-ledger-modal');
    modal.id = PANEL_ID;
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', '叙事账本');

    const backdrop = el('div', 'sl-backdrop');
    backdrop.addEventListener('click', closeDrawer);

    const dialog = el('div', 'sl-dialog');

    const head = el('div', 'sl-head');
    head.append(el('span', 'sl-title', '叙事账本'));
    const ver = el('span', 'sl-version', 'v' + VERSION);
    ver.title = '构建于 ' + BUILD;
    head.append(ver);
    const close = el('button', 'sl-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', closeDrawer);
    head.append(close);

    const tabs = el('div', 'sl-tabs');
    for (const [id, label] of TABS) {
        const b = el('button', 'sl-tab', label);
        b.type = 'button';
        b.dataset.tab = id;
        b.addEventListener('click', () => {
            S.tab = id;
            render();
        });
        tabs.append(b);
    }

    const body = el('div', 'sl-body');
    body.id = 'sl-body';

    dialog.append(head, tabs, body);
    modal.append(backdrop, dialog);
    document.body.append(modal);
    return modal;
}

function ensureModal() {
    return document.getElementById(PANEL_ID) ?? buildModal();
}

function render() {
    const modal = document.getElementById(PANEL_ID);
    if (!modal) return;
    for (const b of modal.querySelectorAll('.sl-tab')) {
        b.classList.toggle('is-active', b.dataset.tab === S.tab);
    }
    const body = document.getElementById('sl-body');
    if (!body) return;
    body.replaceChildren();

    if (S.tab === 'state') {
        const c = card('状态');
        c.append(row('版本', `v${VERSION}（${BUILD}）`));
        c.append(row('世界包', S.packName || S.packId));
        c.append(row('注入', S.injected ? '开' : '关'));
        c.append(row('预算', S.tokens ? `${S.tokens} token` : '—'));
        c.append(row('裁剪', S.dropped?.length ? S.dropped.join('、') : '无'));
        c.append(row('副模型', S.transport));
        c.append(row('聊天', S.chatId));
        c.append(row('楼层', S.messageCount));
        body.append(c);

        if (S.block) {
            const b = card('本轮注入');
            b.append(el('pre', 'sl-block', S.block));
            body.append(b);
        }
        if (S.env) {
            const e = card('环境');
            e.append(row('ST', S.env.st));
            e.append(row('事件源', S.env.eventSource ? 'ok' : '缺失'));
            e.append(row('setExtensionPrompt', S.env.setPrompt ? 'ok' : '缺失'));
            e.append(row('prompt 类型表', S.env.promptTypes ? 'ok' : '缺失'));
            e.append(row('chatMetadata', S.env.chatMetadata ? 'ok' : '缺失'));
            e.append(row('副模型服务', S.env.conn ? 'ok' : '缺失'));
            body.append(e);
        }
    }

    if (S.tab === 'events') {
        const p = card('未结');
        if (!S.pending.length) p.append(el('div', 'sl-note', '没有未结事件'));
        for (const e of S.pending) p.append(row(e.name, e.arc ? `第${e.arc}幕` : ''));
        body.append(p);
        const d = card('已结');
        if (!S.done.length) d.append(el('div', 'sl-note', '还没有'));
        for (const name of S.done) d.append(row(name, ''));
        body.append(d);
    }

    if (S.tab === 'items') {
        const c = card('物品');
        if (!S.items.length) c.append(el('div', 'sl-note', '这里还没有物品'));
        for (const i of S.items) {
            c.append(row(i.name, `${i.cond} · ${i.hold}${i.at ? ' · ' + i.at : ''}`));
        }
        body.append(c);
    }

    if (S.tab === 'pack') {
        const c = card('世界包');
        c.append(row('当前', `${S.packName || '—'}（${S.packId}）`));
        const list = S.packs ?? [];
        c.append(row('已加载', list.length ? `${list.length} 个` : '无'));

        if (list.length) {
            const sel = el('select', 'sl-input sl-select');
            for (const p of list) {
                const o = el('option', null, `${p.name}（${p.id}）`);
                o.value = p.id;
                if (p.id === S.packId) o.selected = true;
                sel.append(o);
            }
            sel.addEventListener('change', () => {
                const id = sel.value;
                S.packId = id;
                try {
                    packHandler?.(id);
                } catch (e) {
                    console.warn('[叙事账本] switch pack failed', e);
                }
            });
            c.append(sel);
            c.append(el('div', 'sl-note', '切换只影响当前聊天。'));
        } else {
            c.append(el('div', 'sl-note', '没有加载到任何世界包，正在用内置兜底包。'));
        }
        if (S.packError) c.append(el('div', 'sl-note', '载入问题：' + S.packError));
        body.append(c);

        const s = card('副模型');
        s.append(row('状态', S.transport));

        // 有连接配置就列出来，没有就让用户手填
        const names = S.profiles ?? [];
        let picker;
        if (names.length) {
            picker = el('select', 'sl-input sl-select');
            const empty = el('option', null, '（不启用副模型）');
            empty.value = '';
            picker.append(empty);
            for (const n of names) {
                const o = el('option', null, n);
                o.value = n;
                if (n === S.profileId) o.selected = true;
                picker.append(o);
            }
        } else {
            picker = el('input', 'sl-input');
            picker.type = 'text';
            picker.placeholder = 'ST 连接配置名（如 北凉·记账）';
            picker.value = S.profileId ?? '';
        }
        s.append(picker);

        const btns = el('div', 'sl-btn-row');
        const saveBtn = el('button', 'sl-btn', '保存');
        saveBtn.type = 'button';
        const testBtn = el('button', 'sl-btn', '测试');
        testBtn.type = 'button';
        btns.append(saveBtn, testBtn);
        s.append(btns);

        const status = el('div', 'sl-note', S.testResult ? S.testResult : '');
        s.append(status);

        saveBtn.addEventListener('click', () => {
            const id = String(picker.value ?? '').trim();
            S.profileId = id;
            try {
                saveHandler?.(id);
                status.textContent = id ? `已保存：${id}` : '已保存：已关闭副模型';
                S.testResult = status.textContent;
            } catch (e) {
                status.textContent = '保存失败：' + (e?.message ?? e);
            }
        });

        testBtn.addEventListener('click', async () => {
            const id = String(picker.value ?? '').trim();
            if (!id) {
                status.textContent = '先选一个连接配置';
                return;
            }
            testBtn.disabled = true;
            status.textContent = '测试中…';
            try {
                const r = await testHandler?.(id);
                if (r?.ok) {
                    status.textContent = `连通 · ${r.ms} ms · 回复「${r.text || '空'}」`;
                } else {
                    status.textContent = '失败：' + (r?.msg ?? '未知错误');
                }
                S.testResult = status.textContent;
            } catch (e) {
                status.textContent = '失败：' + (e?.message ?? e);
            } finally {
                testBtn.disabled = false;
            }
        });

        s.append(el('div', 'sl-note', '选 ST 里已有的连接配置。留空则不做结算：状态块照常注入，但好感与礼法不会自动变。'));
        body.append(s);

        const r = card('开局');
        const btn = el('button', 'sl-btn', '重置到开局' + (S.openingLabel ? `（${S.openingLabel}）` : ''));
        btn.type = 'button';
        btn.addEventListener('click', () => {
            if (!window.confirm('会清空本档已记录的事件与状态，回到城外五里那一刻。继续？')) return;
            try {
                resetHandler?.();
            } catch (e) {
                console.warn('[叙事账本] reset failed', e);
            }
        });
        r.append(btn);
        r.append(el('div', 'sl-note', S.openingLabel || '开局由世界包的 opening 段决定'));
        body.append(r);
    }

    if (S.tab === 'review') {
        const c = card(`审稿（${S.review.length}）`);
        if (!S.review.length) c.append(el('div', 'sl-note', '无异常'));
        for (const f of S.review) {
            c.append(row(f.level, f.msg + (f.quote ? `：「${f.quote}」` : '')));
        }
        body.append(c);
    }
}

export function refreshPanel(patch = {}) {
    Object.assign(S, patch);
    render();
}

export function openDrawer() {
    const modal = ensureModal();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body?.classList.add('story-ledger-locked');
    render();
}

export function closeDrawer() {
    const modal = document.getElementById(PANEL_ID);
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body?.classList.remove('story-ledger-locked');
}

export function mountPanel() {
    ensureModal();
    if (!mountPanel._esc) {
        mountPanel._esc = true;
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeDrawer();
        });
    }
}
