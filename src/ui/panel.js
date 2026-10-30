import { VERSION, PANEL_ID } from '../core/version.js';

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
};

let profileHandler = null;
let resetHandler = null;

export function onProfileChange(fn) {
    profileHandler = fn;
}

export function onReset(fn) {
    resetHandler = fn;
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

function buildDrawer() {
    const d = el('div', 'story-ledger-drawer');
    d.id = PANEL_ID;
    d.setAttribute('aria-hidden', 'true');
    const head = el('div', 'sl-head');
    head.append(el('span', 'sl-title', '叙事账本'));
    head.append(el('span', 'sl-version', 'v' + VERSION));
    const close = el('button', 'sl-close', '×');
    close.type = 'button';
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

    d.append(head, tabs, body);
    document.body.append(d);
    return d;
}

function ensure() {
    return document.getElementById(PANEL_ID) ?? buildDrawer();
}

function render() {
    const body = document.getElementById('sl-body');
    if (!body) return;
    for (const b of document.querySelectorAll('.sl-tab')) {
        b.classList.toggle('is-active', b.dataset.tab === S.tab);
    }
    body.replaceChildren();

    if (S.tab === 'state') {
        const c = card('状态');
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
        c.append(row('id', S.packId));
        c.append(row('名称', S.packName));
        body.append(c);

        const s = card('副模型');
        s.append(row('状态', S.transport));
        const input = el('input', 'sl-input');
        input.type = 'text';
        input.placeholder = 'ST 连接配置名（如 北凉·记账）';
        input.value = S.profileId ?? '';
        input.addEventListener('change', () => {
            S.profileId = input.value.trim();
            try {
                profileHandler?.(S.profileId);
            } catch {
                /* noop */
            }
        });
        s.append(input);
        s.append(el('div', 'sl-note', '留空则不做结算：状态块照常注入，但好感与礼法不会自动变化。'));
        body.append(s);

        const r = card('开局');
        const btn = el('button', 'sl-btn', '重置到开局（雁回县外）');
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
        r.append(el('div', 'sl-note', '承平二十七年九月十四 · 酉初三刻 · 北门外五里'));
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
    const d = ensure();
    d.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
    render();
}

export function closeDrawer() {
    const d = document.getElementById(PANEL_ID);
    if (!d) return;
    d.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
}

export function mountPanel() {
    ensure();
}
