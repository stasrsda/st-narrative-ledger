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
    importStatus: '',
    direct: {},
    settle: null,
    aff: null,
    onstageEdit: false,
    hudCollapsed: false,
    stateDetail: 'lean',
    cleanMsg: '',
    hudOn: true,
    directMsg: '',
    profileMsg: '',
};

let profileHandler = null;
let resetHandler = null;
let packHandler = null;
let saveHandler = null;
let testHandler = null;
let importHandler = null;
let listHandler = null;
let settleNowHandler = null;
let diagHandler = null;
let onstageHandler = null;
let detailHandler = null;
let scrubHandler = null;

try {
    const saved = localStorage.getItem('storyLedger.hud');
    if (saved === '0') S.hudOn = false;
} catch { /* noop */ }

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

export function onImportPack(fn) {
    importHandler = fn;
}

export function onListModels(fn) {
    listHandler = fn;
}

export function onSettleNow(fn) {
    settleNowHandler = fn;
}

export function onExportDiag(fn) {
    diagHandler = fn;
}

export function onOnstageChange(fn) {
    onstageHandler = fn;
}

export function onStateDetailChange(fn) {
    detailHandler = fn;
}

export function onScrubChat(fn) {
    scrubHandler = fn;
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

/** 底部常驻好感条（只在有人在场时出现） */
function renderHud() {
    const id = 'story-ledger-hud';
    let hud = document.getElementById(id);
    const bar = S.aff?.bar ?? [];
    if (!S.hudOn) {
        hud?.remove();
        return;
    }
    if (!bar.length) {
        // 没有在场者时也留一个小胶囊，免得用户以为插件死了
        if (!hud) {
            hud = el('div', 'story-ledger-hud is-collapsed');
            hud.id = id;
            hud.addEventListener('click', () => openDrawer());
            (document.body ?? document.documentElement).append(hud);
        }
        hud.replaceChildren();
        hud.append(el('span', 'sl-hud-pill', S.aff?.all?.length ? '账本 · 未有在场者' : '账本 · 读取中'));
        return;
    }
    if (!hud) {
        hud = el('div', 'story-ledger-hud');
        hud.id = id;
        hud.title = '叙事账本 · 点击打开面板';
        hud.addEventListener('click', () => openDrawer());
        (document.body ?? document.documentElement).append(hud);
    }
    hud.replaceChildren();

    // 折叠态：只留一个小胶囊
    if (S.hudCollapsed) {
        hud.classList.add('is-collapsed');
        const pill = el('span', 'sl-hud-pill', `账本 · ${bar.length} 人`);
        pill.addEventListener('click', ev => {
            ev.stopPropagation();
            S.hudCollapsed = false;
            localStorage.setItem('storyLedger.hudCollapsed', '0');
            render();
        });
        hud.append(pill);
        return;
    }
    hud.classList.remove('is-collapsed');

    if (S.aff?.isOpening) {
        hud.append(el('span', 'sl-hud-tag', '初始'));
    }

    for (const p of bar) {
        const item = el('span', 'sl-hud-item');
        item.append(el('span', 'sl-hud-name', p.name));
        item.append(el('span', 'sl-hud-aff' + (p.aff < 0 ? ' is-neg' : p.aff > 0 ? ' is-pos' : ''), String(p.aff)));
        item.append(el('span', 'sl-hud-band', p.band));
        item.addEventListener('click', ev => {
            ev.stopPropagation();
            openDrawer();
        });
        hud.append(item);
    }

    const fold = el('span', 'sl-hud-fold', '−');
    fold.title = '收起（不进入 AI 上下文）';
    fold.addEventListener('click', ev => {
        ev.stopPropagation();
        S.hudCollapsed = true;
        localStorage.setItem('storyLedger.hudCollapsed', '1');
        render();
    });
    hud.append(fold);
}

function render() {
    const modal = document.getElementById(PANEL_ID);
    if (!modal) return;
    for (const b of modal.querySelectorAll('.sl-tab')) {
        b.classList.toggle('is-active', b.dataset.tab === S.tab);
    }
    const body = document.getElementById('sl-body');
    if (!body) return;
    // 记住滚动位置：重渲染不该把用户弹回顶部
    const keepTop = body.scrollTop;
    body.replaceChildren();

    if (S.tab === 'state') {
        const c = card('状态');
        c.append(row('版本', `v${VERSION}（${BUILD}）`));
        c.append(row('世界包', S.packName || S.packId));
        c.append(row('注入', S.injected ? '开' : '关'));
        c.append(row('预算', S.tokens ? `${S.tokens} token` : '—'));
        c.append(row('裁剪', S.dropped?.length ? S.dropped.join('、') : '无'));
        c.append(row('副模型', S.transport));

        const st = S.settle ?? null;
        const settleText = st
            ? (st.at ? `${st.ok === false ? '失败' : st.ok === true ? '成功' : '等待'} · ${st.msg}` : '尚未结算')
            : '尚未结算';
        c.append(row('结算', settleText));

        const retry = el('button', 'sl-btn', '重试结算这一楼');
        retry.type = 'button';
        retry.addEventListener('click', async () => {
            retry.disabled = true;
            try {
                const r = await settleNowHandler?.();
                if (r && !r.ok) {
                    S.settle = { at: Date.now(), ok: false, msg: r.msg };
                    render();
                }
            } finally {
                setTimeout(() => { retry.disabled = false; }, 1500);
            }
        });
        c.append(retry);

        const copyBtn = el('button', 'sl-btn', '复制诊断信息');
        copyBtn.type = 'button';
        copyBtn.addEventListener('click', async () => {
            try {
                const text = diagHandler?.() ?? '';
                await navigator.clipboard.writeText(text);
                S.settle = { ...(S.settle ?? {}), msg: '诊断信息已复制' };
            } catch (e) {
                console.warn('[叙事账本] copy failed', e);
                S.settle = { ...(S.settle ?? {}), msg: '复制失败，看控制台' };
                try { console.log(diagHandler?.()); } catch { /* noop */ }
            }
            render();
        });
        c.append(copyBtn);

        c.append(row('聊天', S.chatId));
        c.append(row('楼层', S.messageCount));
        body.append(c);

        if (S.diag?.actorList?.length) {
            const fromAi = S.diag.onstageSrc === 'ai';
            const oc = card('在场');
            oc.append(el('div', 'sl-note',
                fromAi ? '由主模型每轮在【在场】行给出。' : '当前是开局/手动名单，等主模型写出【在场】行后会自动接管。'));

            const on = S.diag.actorList.filter(a => a.on);
            oc.append(row('现在在场', on.length ? on.map(a => a.name).join('、') : '（无人）'));

            const toggle = el('button', 'sl-btn', S.onstageEdit ? '收起手动修正' : '手动修正');
            toggle.type = 'button';
            toggle.addEventListener('click', () => {
                S.onstageEdit = !S.onstageEdit;
                render();
            });
            oc.append(toggle);

            if (S.onstageEdit) {
                oc.append(el('div', 'sl-note', '勾选会直接覆盖名单；之后主模型写出【在场】行时会再接管。'));
                for (const a of S.diag.actorList) {
                    const line = el('label', 'sl-check-row');
                    const cb = el('input', '');
                    cb.type = 'checkbox';
                    cb.checked = Boolean(a.on);
                    cb.addEventListener('change', () => {
                        a.on = cb.checked;
                        try {
                            onstageHandler?.(a.id, cb.checked);
                        } catch (e) {
                            console.warn('[叙事账本] onstage change failed', e);
                        }
                    });
                    line.append(cb, el('span', 'sl-check-name', a.name));
                    oc.append(line);
                }
            }
            body.append(oc);
        }

        if (S.aff?.all?.length) {
            const ac = card('好感（全部角色）');
            for (const p of S.aff.all) {
                ac.append(row(`${p.name}`, `${p.aff} · ${p.band}`));
            }
            body.append(ac);
        }

        if (S.block) {
            const b = card('本轮注入');
            b.append(el('pre', 'sl-block', S.block));
            body.append(b);
        }
        if (S.diag) {
            const dg = card('诊断');
            dg.append(row('当前包', `${S.diag.packName || '—'}（${S.diag.packId}）`));
            dg.append(row('角色数', S.diag.actors ?? 0));
            dg.append(row('基础好感', S.diag.sample ?? '—'));
            dg.append(row('此刻好感', S.diag.affNow ?? '—'));
            dg.append(row('在场名单', S.diag.onstage ?? '（空）'));
            dg.append(row('在场来源', S.diag.onstageSrc === 'ai' ? '主模型写的【在场】行' : '手动/开局'));
            dg.append(row('事件数', S.diag.lastEvents ?? 0));
            dg.append(row('末楼字数', S.diag.lastLen ?? 0));
            const h = S.diag.hud ?? {};
            dg.append(row('好感条', h.on === false ? '已关闭（世界包页可开）' : `开 · 在场 ${h.onstage ?? 0} 人`));
            if (S.diag.lastThink) {
                dg.append(row('其中思考', `${S.diag.lastThink} 字（正文 ${S.diag.lastBody ?? 0} 字）`));
            }
            if (S.diag.lastBroken) {
                dg.append(el('div', 'sl-note',
                    '⚠ 上一楼的思考标记没有闭合：整楼都是思考，没有正文。换模型或关掉思考。'));
            }
            if (S.diag.lastCut) {
                dg.append(el('div', 'sl-note', '⚠ 末楼正文疑似被截断：结尾没有句读。多半是 max_tokens 太小，或思考吃掉了输出预算。'));
            }
            if (S.diag.advance) {
                const a = S.diag.advance;
                dg.append(row('上一轮推进', `${a.minutes} 分（${a.why}）`));
            }
            dg.append(row('变量同步', (S.diag.vars ?? 0) + ' 个'));
            const books = S.diag.books ?? [];
            dg.append(row('世界书', books.length ? books.join(' / ') : '（无）'));
            if (books.length > 1) {
                dg.append(el('div', 'sl-note', '⚠ 挂了多本世界书：旧书若还写着「好感现状」，会盖掉插件注入。'));
            }
            dg.append(row('直连', S.diag.directReady ? '已保存' : '未保存'));
            dg.append(row('Key 长度', S.diag.keyLen ?? 0));
            dg.append(row('连接配置', S.diag.profileId || '未填'));
            body.append(dg);
        }

        // 一次性工具：清掉历史楼层里遗留的状态块
        const sc = card('清理旧楼（一次性）');
        sc.append(el('div', 'sl-note',
            '新楼会自动清理；这个按钮清的是已经写进历史的旧内容（<好感> 块、【在场】行、误抄的状态块）。点一次就够。'));
        const scBtn = el('button', 'sl-btn', '清掉历史里的状态残留');
        scBtn.type = 'button';
        scBtn.addEventListener('click', () => {
            const r = scrubHandler?.();
            S.cleanMsg = r ? `已清理 ${r.messages} 楼、${r.blocks} 处` : '没有需要清理的';
            render();
        });
        sc.append(scBtn);
        if (S.cleanMsg) sc.append(el('div', 'sl-note', S.cleanMsg));
        body.append(sc);

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

        // ── 导入 ──
        const imp = card('导入世界包');

        // 手机上一律用系统文件选择器：不限制 MIME，选到再说，
        // 因为不少安卓文件管理器会把 .json 标成 octet-stream，限制类型反而选不到。
        const pickLabel = el('label', 'sl-btn sl-file-btn', '选择 JSON 文件');
        pickLabel.setAttribute('for', 'story-ledger-file');
        const file = el('input', '');
        file.type = 'file';
        file.id = 'story-ledger-file';
        file.accept = '*/*';
        file.style.display = 'none';
        imp.append(pickLabel, file);

        imp.append(el('div', 'sl-note', '手机上点上面按钮 → 系统文件选择器 → 找到下载/微信里的 .json'));

        const ta = el('textarea', 'sl-input sl-textarea');
        ta.placeholder = '电脑上也可以直接粘贴 JSON（手机不用管这个）';
        ta.rows = 3;
        imp.append(ta);

        const ibtn = el('button', 'sl-btn', '粘贴内容导入');
        ibtn.type = 'button';
        imp.append(ibtn);

        const istat = el('div', 'sl-note', S.importStatus || '导入后会自动切到这个包，并存进 ST 设置，重启仍在。');
        imp.append(istat);

        const doImport = async text => {
            if (!text || !String(text).trim()) {
                istat.textContent = '文件是空的';
                return;
            }
            istat.textContent = '导入中…';
            try {
                const r = await importHandler?.(text);
                if (r?.ok) {
                    S.importStatus = `已导入：${r.name || r.id}`;
                    istat.textContent = S.importStatus;
                } else {
                    istat.textContent = '失败：' + (r?.msg ?? '未知错误');
                }
            } catch (e) {
                istat.textContent = '失败：' + (e?.message ?? e);
            }
        };

        file.addEventListener('change', async () => {
            const f = file.files?.[0];
            if (!f) return;
            istat.textContent = `读取 ${f.name}（${Math.round(f.size / 1024)} KB）…`;
            try {
                const text = await f.text();
                await doImport(text);
            } catch (e) {
                istat.textContent = '读取文件失败：' + (e?.message ?? e);
            } finally {
                file.value = '';
            }
        });

        pickLabel.addEventListener('click', ev => {
            // 有些移动端 WebView 里 label+for 不触发，手动点一次
            if (ev.target === pickLabel) {
                ev.preventDefault();
                file.click();
            }
        });

        ibtn.addEventListener('click', () => {
            const text = ta.value.trim();
            if (!text) {
                istat.textContent = '先把 JSON 粘到上面的框里';
                return;
            }
            void doImport(text);
        });

        // 桌面：拖进这块也能导入
        imp.addEventListener('dragover', ev => {
            ev.preventDefault();
            imp.classList.add('sl-drag');
        });
        imp.addEventListener('dragleave', () => imp.classList.remove('sl-drag'));
        imp.addEventListener('drop', async ev => {
            ev.preventDefault();
            imp.classList.remove('sl-drag');
            const f = ev.dataTransfer?.files?.[0];
            if (!f) return;
            istat.textContent = `读取 ${f.name}…`;
            try {
                await doImport(await f.text());
            } catch (e) {
                istat.textContent = '读取失败：' + (e?.message ?? e);
            }
        });

        body.append(imp);

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

        const status = el('div', 'sl-note', S.profileMsg || S.testResult || '');
        s.append(status);

        saveBtn.addEventListener('click', () => {
            const id = String(picker.value ?? '').trim();
            S.profileId = id;
            try {
                saveHandler?.(id);
                S.profileMsg = id ? `已保存：${id}` : '已保存：已关闭副模型';
            } catch (e) {
                S.profileMsg = '保存失败：' + (e?.message ?? e);
            }
            render();
        });

        testBtn.addEventListener('click', async () => {
            const id = String(picker.value ?? '').trim();
            if (!id) {
                S.profileMsg = '先选一个连接配置';
                render();
                return;
            }
            testBtn.disabled = true;
            S.profileMsg = '测试中…';
            render();
            try {
                const r = await testHandler?.(id);
                S.profileMsg = r?.ok
                    ? `连通 · ${r.ms} ms · 回复「${r.text || '空'}」`
                    : '失败：' + (r?.msg ?? '未知错误');
            } catch (e) {
                S.profileMsg = '失败：' + (e?.message ?? e);
            } finally {
                testBtn.disabled = false;
                render();
            }
        });

        s.append(el('div', 'sl-note', '选 ST 里已有的连接配置。留空则不做结算：状态块照常注入，但好感与礼法不会自动变。'));
        body.append(s);

        // ── 直连（不走 ST 配置）──
        const d = card('直连（不走 ST 配置）');
        d.append(el('div', 'sl-note', '填了就会优先用它；请求经 ST 服务端转发，不受浏览器跨域限制。'));

        const mk = (label, key, placeholder, type = 'text') => {
            const input = el('input', 'sl-input');
            input.type = type;
            input.placeholder = placeholder;
            input.value = S.direct?.[key] ?? '';
            input.dataset.key = key;
            d.append(el('div', 'sl-note', label));
            d.append(input);
            return input;
        };

        const dUrl = mk('Base URL', 'baseUrl', 'https://api.siliconflow.cn/v1');
        const dKey = mk('API Key', 'apiKey', 'sk-...', 'password');
        const dModel = mk('模型', 'model', 'Qwen/Qwen2.5-7B-Instruct');

        const fetchRow = el('div', 'sl-btn-row');
        const fetchBtn = el('button', 'sl-btn', '拉取模型列表');
        fetchBtn.type = 'button';
        fetchRow.append(fetchBtn);
        d.append(fetchRow);

        const filterIn = el('input', 'sl-input');
        filterIn.type = 'text';
        filterIn.placeholder = '过滤模型名（如 qwen / glm / free）';
        d.append(filterIn);

        const modelSel = el('select', 'sl-input sl-select');
        modelSel.style.display = 'none';
        d.append(modelSel);

        let allModels = [];

        const rebuildOptions = () => {
            const kw = String(filterIn.value ?? '').trim().toLowerCase();
            const list = kw ? allModels.filter(id => id.toLowerCase().includes(kw)) : allModels;
            modelSel.replaceChildren();
            const head = el('option', null, list.length ? `共 ${list.length} 个，选一个` : '没有匹配的模型');
            head.value = '';
            modelSel.append(head);
            for (const id of list) {
                const o = el('option', null, id);
                o.value = id;
                if (id === dModel.value) o.selected = true;
                modelSel.append(o);
            }
            modelSel.style.display = list.length ? '' : 'none';
        };

        filterIn.addEventListener('input', rebuildOptions);

        modelSel.addEventListener('change', () => {
            if (modelSel.value) dModel.value = modelSel.value;
        });

        fetchBtn.addEventListener('click', async () => {
            fetchBtn.disabled = true;
            const old = fetchBtn.textContent;
            fetchBtn.textContent = '拉取中…';
            try {
                const r = await listHandler?.(readDirectForList());
                if (r?.ok) {
                    allModels = r.models ?? [];
                    rebuildOptions();
                    fetchBtn.textContent = `已取到 ${allModels.length} 个`;
                } else {
                    fetchBtn.textContent = '拉取失败';
                    S.directMsg = '拉取失败：' + (r?.msg ?? '未知错误');
                    render();
                }
            } catch (e) {
                fetchBtn.textContent = '拉取失败';
                S.directMsg = '拉取失败：' + (e?.message ?? e);
                render();
            } finally {
                fetchBtn.disabled = false;
                setTimeout(() => { fetchBtn.textContent = old; }, 2500);
            }
        });

        const readDirectForList = () => ({
            baseUrl: String(dUrl.value ?? '').trim(),
            apiKey: String(dKey.value ?? '').trim(),
        });

        const dRow = el('div', 'sl-btn-row');
        const dSave = el('button', 'sl-btn', '保存');
        const dTest = el('button', 'sl-btn', '测试');
        dSave.type = 'button';
        dTest.type = 'button';
        dRow.append(dSave, dTest);
        d.append(dRow);

        const dStat = el('div', 'sl-note', S.directMsg || '');
        d.append(dStat);

        const readDirect = () => ({
            baseUrl: String(dUrl.value ?? '').trim(),
            apiKey: String(dKey.value ?? '').trim(),
            model: String(dModel.value ?? '').trim(),
        });

        dSave.addEventListener('click', () => {
            const cfg = readDirect();
            S.direct = cfg;
            try {
                saveHandler?.(null, cfg);
                S.directMsg = cfg.model ? `已保存直连：${cfg.model}` : '已保存（直连为空）';
            } catch (e) {
                S.directMsg = '保存失败：' + (e?.message ?? e);
            }
            render();
        });

        dTest.addEventListener('click', async () => {
            const cfg = readDirect();
            if (!cfg.baseUrl || !cfg.model) {
                S.directMsg = 'Base URL 和模型都要填';
                render();
                return;
            }
            dTest.disabled = true;
            S.directMsg = '测试中…';
            render();
            try {
                const r = await testHandler?.(null, cfg);
                S.directMsg = r?.ok
                    ? `连通 · ${r.ms} ms · 回复「${r.text || '空'}」`
                    : '失败：' + (r?.msg ?? '未知错误');
            } catch (e) {
                S.directMsg = '失败：' + (e?.message ?? e);
            } finally {
                dTest.disabled = false;
                render();
            }
        });

        body.append(d);

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

    body.scrollTop = keepTop;
}

export function refreshPanel(patch = {}) {
    Object.assign(S, patch);
    // HUD 必须在面板之前刷新：面板没建出来时 render() 会提前返回，
    // 但底部好感条跟面板无关，不能因此不显示
    try {
        renderHud();
    } catch (e) {
        console.warn('[叙事账本] HUD 渲染失败', e);
    }
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
