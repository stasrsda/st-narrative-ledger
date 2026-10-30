// 叙事账本 · 入口
// 不静态 import script.js：新版 ST 若改名/挪位置，静态导入会让整个扩展加载失败。
// 改成运行时动态取，取不到就用字符串常量兜底——扩展至少能起来。
try { console.log('[叙事账本] module start'); } catch { /* noop */ }

import { VERSION } from './src/core/version.js';
import { mountPanel, refreshPanel, openDrawer, closeDrawer, onProfileChange, onReset, onPackChange, onSaveProfile, onTestModel, onImportPack } from './src/ui/panel.js';
import {
    ctx, chatId, messages, lastMessageIndex, readMeta, writeMeta,
    appendEvents, eventsByFloor, packMatchNames,
} from './src/adapters/st/context.js';
import { setStatePrompt, clearStatePrompt, setRawSlot } from './src/adapters/st/prompt.js';
import { transportAvailable, requestCompletion } from './src/adapters/st/llm.js';
import { createRegistry, addPack, resolvePack } from './src/core/pack/registry.js';
import { BUILTIN_PACK } from './src/core/pack/builtin.js';
import { fold } from './src/core/ledger/ledger.js';
import { openingMeta, openingLabel } from './src/core/runtime/opening.js';
import { createTree, putNode } from './src/core/place/tree.js';
import { buildSceneBlock, onstageOf, pendingEvents, doneEventNames } from './src/core/runtime/scene.js';
import { parseHeader, rewriteHeader } from './src/core/clock/clock.js';
import { candidatesFor } from './src/core/codes/codes.js';
import { createQueue } from './src/llm/queue.js';
import { buildSettleMessages } from './src/llm/prompt.js';
import { normalizeSettle } from './src/llm/schema.js';
import { toEvents } from './src/llm/settle.js';
import { reviewText, summarize } from './src/core/review/review.js';

const MENU_CLASS = 'story-ledger-menu-item';
const registry = createRegistry();
const settings = { profileId: '', depth: 1, enabled: true };

// 启动信标：模块一被求值就在 <head> 留痕，不依赖控制台就能查
try {
    const beacon = document.createElement('meta');
    beacon.id = 'story-ledger-boot';
    beacon.setAttribute('data-version', VERSION);
    beacon.setAttribute('data-at', new Date().toISOString());
    document.head.appendChild(beacon);
} catch { /* noop */ }

/** 事件源与事件名：先取全局，再动态 import script.js，最后回落字符串常量 */
let eventSource = globalThis.eventSource ?? null;
let EV = globalThis.event_types ?? {
    CHAT_CHANGED: 'chat_changed',
    GENERATION_AFTER_COMMANDS: 'generation_after_commands',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_SWIPED: 'message_swiped',
    MESSAGE_DELETED: 'message_deleted',
};

async function loadSTEvents() {
    // 1) 优先从 SillyTavern.getContext() 取（1.19 里它直接带 eventSource / eventTypes）
    try {
        const c = ctx();
        if (c?.eventSource) eventSource = c.eventSource;
        if (c?.eventTypes) EV = { ...EV, ...c.eventTypes };
    } catch { /* noop */ }
    if (typeof eventSource?.on === 'function' && EV.CHAT_CHANGED) return;

    // 2) 退回动态导入（public/script.js 要在扩展目录往上四层）
    try {
        const mod = await import('../../../../script.js');
        eventSource = mod.eventSource ?? eventSource;
        if (mod.event_types) EV = { ...EV, ...mod.event_types };
    } catch (e) {
        log('script.js 取不到，用上下文或字符串常量', e?.message ?? e);
    }
}

/** 环境自检：面板里能看见，出问题不用翻控制台 */
function envInfo() {
    const c = ctx();
    return {
        st: c.version ?? c.SillyTavern?.version ?? '未知',
        eventSource: typeof eventSource?.on === 'function',
        setPrompt: typeof c.setExtensionPrompt === 'function',
        promptTypes: Boolean(c.extension_prompt_types),
        chatMetadata: Boolean(c.chatMetadata),
        conn: typeof c.ConnectionManagerRequestService?.sendRequest === 'function',
        extSettings: Boolean(c.extensionSettings),
    };
}

function log(...a) {
    try {
        console.log('[叙事账本]', ...a);
    } catch {
        /* noop */
    }
}

let bundledLoaded = false;

/** 随扩展一起带的包：先私人包，再通用示例包；缺哪个跳过哪个 */
const BUNDLED_PACKS = ['beiliang', 'guofeng'];

/** 把之前导入过的包重新装进 registry */
function restoreImportedPacks() {
    const saved = importedPacks();
    const ids = Object.keys(saved);
    for (const id of ids) {
        const r = addPack(registry, saved[id]);
        if (!r.ok) log(`导入包 ${id} 恢复失败`, r.errors?.slice(0, 2));
    }
    if (ids.length) log(`已恢复 ${ids.length} 个导入的世界包`);
}

async function loadBundledPacks() {
    if (bundledLoaded) return;
    bundledLoaded = true;
    for (const name of BUNDLED_PACKS) {
        try {
            const res = await fetch(new URL(`./packs/${name}.worldpack.json`, import.meta.url));
            if (!res.ok) continue;
            const pack = await res.json();
            const r = addPack(registry, pack);
            if (!r.ok) log(`世界包 ${name} 校验失败`, r.errors?.slice(0, 3));
        } catch (e) {
            log(`世界包 ${name} 未载入`, e?.message);
        }
    }
}

function ensurePack() {
    if (!registry.order.length) addPack(registry, BUILTIN_PACK);
    const def = ['beiliang', 'guofeng'].find(id => registry.packs[id]) ?? registry.order[0];
    return resolvePack(registry, {
        packId: readMeta()?.packId,
        ...packMatchNames(),
        defaultId: def,
    });
}

/** 用户导入过的世界包（存在 ST 设置里，重启仍在） */
function importedPacks() {
    try {
        return ctx().extensionSettings?.storyLedger?.importedPacks ?? {};
    } catch {
        return {};
    }
}

function saveImportedPack(id, pack) {
    try {
        const c = ctx();
        c.extensionSettings = c.extensionSettings ?? {};
        const sl = c.extensionSettings.storyLedger ?? {};
        sl.importedPacks = { ...(sl.importedPacks ?? {}), [id]: pack };
        c.extensionSettings.storyLedger = sl;
        c.saveSettingsDebounced?.();
        return true;
    } catch (e) {
        log('保存导入包失败', e?.message ?? e);
        return false;
    }
}

/** ST 里已有的连接配置名（Connection Manager → profiles[].name） */
function profileNames() {
    try {
        const cm = ctx().extensionSettings?.connectionManager;
        const list = cm?.profiles ?? [];
        return list.map(p => p?.name).filter(Boolean);
    } catch {
        return [];
    }
}

/** 载包失败时的说明，给面板看 */
function packErrorText() {
    const errs = registry.errors ?? {};
    const ids = Object.keys(errs);
    if (!ids.length) return '';
    const first = errs[ids[0]];
    const one = first?.[0];
    return `${ids[0]}：${one?.msg ?? '校验未通过'}`;
}

/** 下拉框用的世界包列表 */
function packChoices() {
    if (!registry.order.length) addPack(registry, BUILTIN_PACK);
    return registry.order.map(id => ({
        id,
        name: registry.packs[id]?.name ?? id,
    }));
}

function treeOf(pack) {
    const tree = createTree();
    for (const p of pack.places ?? []) putNode(tree, p);
    return tree;
}

function currentState() {
    const { pack } = ensurePack();
    let meta = readMeta();
    if (!meta?.seed) {
        // 新聊天或从未设置过：直接落一份开局状态，避免出现「承平元年正月初一」
        const fresh = openingMeta(pack);
        writeMeta(fresh);
        meta = { ...(readMeta() ?? {}), ...fresh };
        log('首次进入本聊天，已写入开局状态');
    }
    const state = fold(meta.seed, eventsByFloor());
    state.place = meta.placeId ?? meta.seed?.place ?? state.place;
    return { pack, state, meta };
}

function composeAndInject() {
    const { pack, state, meta } = currentState();
    const tree = treeOf(pack);
    // 当轮提示文本：玩家这句话 + 上一段正文的尾巴，用来判断要不要挂物价/用色/路程
    const msgs = messages();
    const lastUser = [...msgs].reverse().find(m => m.is_user)?.mes ?? '';
    const lastAi = msgs[msgs.length - 1]?.mes?.slice(-200) ?? '';
    const hintText = lastUser + lastAi;
    const block = buildSceneBlock({ pack, state, tree, chatSeed: chatId(), meta: { ...meta, hintText }, budget: settings.depth === 1 ? 220 : 260 });
    const ok = settings.enabled && (setStatePrompt(block.text) || setRawSlot(block.text));

    refreshPanel({
        packId: pack.id,
        packName: pack.name,
        packs: packChoices(),
        profiles: profileNames(),
        packError: packErrorText(),
        openingLabel: openingLabel(pack),
        injected: Boolean(ok),
        tokens: block.tokens,
        dropped: block.dropped,
        block: block.text,
        pending: pendingEvents(pack, state, 6),
        done: doneEventNames(pack, state, 6),
        items: Object.values(state.items ?? {}),
        transport: transportAvailable() ? (settings.profileId ? '就绪' : '缺连接配置') : '不可用',
        chatId: chatId(),
        messageCount: messages().length,
    });
    return block;
}

/** 生成后：时间头 → 事件 → 重写首行 → 审稿 → 投递结算 */
function settleMessage() {
    const idx = lastMessageIndex();
    const msg = messages()[idx];
    if (!msg || msg.is_user) return;

    const { pack, state, meta } = currentState();
    const parsed = parseHeader(msg.mes ?? '', pack.calendar);

    if (parsed) {
        const prev = meta.lastT ?? 0;
        appendEvents(msg, [{ k: 'clock', t: parsed.t, src: 'header' }]);
        writeMeta({ lastT: parsed.t, placeName: parsed.place || meta.placeName || '', backward: parsed.t < prev });
        const fixed = rewriteHeader(msg.mes, parsed.t, parsed.place || meta.placeName || '');
        if (fixed !== msg.mes) {
            msg.mes = fixed;
            try {
                ctx().saveChat?.();
            } catch {
                /* noop */
            }
        }
    }

    // 审稿（纯规则）
    const userText = messages()[idx - 1]?.mes ?? '';
    const findings = reviewText({ text: msg.mes, userInput: userText, pack, state });
    refreshPanel({ review: findings, reviewSum: summarize(findings) });

    // 投递结算
    if (pack && transportAvailable() && settings.profileId) {
        enqueueSettle(idx, pack, state, userText, msg.mes);
    }
}

const settleQueue = createQueue({
    handler: async task => {
        const res = await requestCompletion(task.messages, { profileId: settings.profileId });
        const actorIds = new Set(Object.keys(task.pack.index?.actor ?? {}));
        const parsed = normalizeSettle(res, { actorIds, text: task.text });
        if (!parsed.ok) throw new Error(parsed.error);
        const events = toEvents(task.pack, task.state, parsed.data);
        if (!events.length) return;
        const msg = messages()[task.msgIndex];
        appendEvents(msg, events);
        try {
            ctx().saveChat?.();
        } catch {
            /* noop */
        }
        composeAndInject();
    },
    retries: 2,
    onError: e => log('结算失败', e?.message),
});

function enqueueSettle(msgIndex, pack, state, userText, aiText) {
    const meta = readMeta() ?? {};
    const onstage = onstageOf(pack, state, meta);
    const rankIds = onstage.map(o => o.rank).filter(Boolean);
    const scene = state.place ? treeOf(pack).nodes?.[state.place]?.scene : null;
    const candidates = candidatesFor(pack, { scene, rankIds, household: meta.household ?? {} });
    const msgs = buildSettleMessages({ pack, state, onstage, userText, aiText, candidates });
    settleQueue.push({ msgIndex, pack, state, messages: msgs, text: aiText });
}

/**
 * 老版本 ST 的魔杖菜单入口；1.19 没有 #extensionsMenu，走 setupSettings。
 */
function mountMenu() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (menu.querySelector('.' + MENU_CLASS)) return true;
    const item = document.createElement('div');
    item.className = 'extension_container interactable ' + MENU_CLASS;
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-scroll fa-fw"></div><span>叙事账本</span>';
    item.addEventListener('click', () => openDrawer());
    menu.append(item);
    return true;
}

/** 轮询等元素出现（照小白X 的写法：100ms 一次，默认 10 秒） */
function waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    return new Promise(resolve => {
        const tick = () => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            if (Date.now() - start >= timeout) return resolve(null);
            setTimeout(tick, 100);
        };
        tick();
    });
}

/** ST 1.19 不一定吃 manifest 的 css 字段，自己注入一份 */
async function injectStyles() {
    if (document.getElementById('story-ledger-style')) return true;
    try {
        const res = await fetch(new URL('./style.css', import.meta.url));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const css = await res.text();
        const el = document.createElement('style');
        el.id = 'story-ledger-style';
        el.textContent = css;
        document.head.append(el);
        return true;
    } catch (e) {
        log('样式注入失败（界面会没样式但不影响功能）', e?.message ?? e);
        return false;
    }
}

/** 兜底：右下角常驻小按钮。内联样式，不依赖 CSS 是否加载 */
function mountFab() {
    if (document.getElementById('story-ledger-fab')) return true;
    const fab = document.createElement('div');
    fab.id = 'story-ledger-fab';
    fab.className = MENU_CLASS;
    fab.title = '叙事账本 v' + VERSION;
    fab.innerHTML = '<i class="fa-solid fa-scroll"></i>';
    fab.setAttribute('style', [
        'position:fixed', 'right:16px', 'bottom:84px', 'width:44px', 'height:44px',
        'border-radius:50%', 'display:flex', 'align-items:center', 'justify-content:center',
        'background:rgba(30,30,34,.92)', 'border:1px solid #666', 'color:#eee',
        'box-shadow:0 2px 10px rgba(0,0,0,.35)', 'cursor:pointer', 'z-index:30000',
    ].join(';'));
    fab.addEventListener('click', () => openDrawer());
    (document.body ?? document.documentElement).append(fab);
    return true;
}

/** 1.19：把界面挂进扩展设置区（等它真正出现） */
async function setupSettings(attempt = 0) {
    const host = await waitForElement('#extensions_settings', 15000)
        ?? await waitForElement('#extensions_settings2', 3000);
    if (!host) {
        if (attempt < 2) return setupSettings(attempt + 1);
        log('等不到 #extensions_settings，只保留悬浮按钮');
        return false;
    }
    if (host.querySelector('.story-ledger-settings')) return true;

    // 结构与小白X 的 settings.html 一致；折叠逻辑交给 ST 的全局处理器
    // （script.js: $(document).on('click', '.inline-drawer-toggle', ...)）
    const block = document.createElement('div');
    block.className = 'story-ledger-settings';
    block.innerHTML = [
        '<div class="inline-drawer">',
        '  <div class="inline-drawer-toggle inline-drawer-header">',
        '    <b>叙事账本</b>',
        '    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>',
        '  </div>',
        '  <div class="inline-drawer-content">',
        '    <div class="story-ledger-body">',
        `      <div class="sl-note">v${VERSION} · 时间 / 地点 / 在场 / 好感 / 礼法 / 器物</div>`,
        '      <div class="menu_button menu_button_icon story-ledger-open">',
        '        <i class="fa-solid fa-scroll"></i><span>打开面板</span>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>',
    ].join('\n');
    host.append(block);
    log('已挂到扩展设置区');
    return true;
}

function onChatChanged() {
    clearStatePrompt();
    composeAndInject();
}

function boot() {
    try { mountPanel(); } catch (e) { log('建面板失败', e?.message ?? e); }
    mountFab();                    // 先保证有入口（内联样式，不依赖 CSS）
    void injectStyles();           // 自己注入样式，不等 manifest 的 css
    void setupSettings();          // 等扩展设置区出现后挂正规入口
    try {
        const saved = ctx().extensionSettings?.storyLedger;
        if (saved?.profileId) settings.profileId = saved.profileId;
    } catch {
        /* noop */
    }
    onProfileChange(id => {
        settings.profileId = id;
        try {
            const c = ctx();
            c.extensionSettings = c.extensionSettings ?? {};
            c.extensionSettings.storyLedger = { ...(c.extensionSettings.storyLedger ?? {}), profileId: id };
            c.saveSettingsDebounced?.();
        } catch {
            /* noop */
        }
        refreshPanel({ profileId: id, transport: transportAvailable() ? (id ? '就绪' : '缺连接配置') : '不可用' });
    });
    onReset(() => {
        const { pack } = ensurePack();
        const meta = openingMeta(pack);
        writeMeta(meta);
        for (const msg of messages()) {
            if (msg?.extra?.storyLedger) delete msg.extra.storyLedger.events;
        }
        try {
            ctx().saveChat?.();
        } catch {
            /* noop */
        }
        composeAndInject();
        log('已重置到开局', meta.placeName);
    });
    onPackChange(id => {
        if (!registry.packs[id]) return;
        writeMeta({ packId: id });
        composeAndInject();
        log('已切换世界包', id);
    });
    onSaveProfile(id => {
        settings.profileId = id;
        try {
            const c = ctx();
            c.extensionSettings = c.extensionSettings ?? {};
            c.extensionSettings.storyLedger = { ...(c.extensionSettings.storyLedger ?? {}), profileId: id };
            c.saveSettingsDebounced?.();
        } catch { /* noop */ }
        refreshPanel({ profileId: id, transport: transportAvailable() ? (id ? '就绪' : '缺连接配置') : '不可用' });
        log('副模型已保存', id || '（关闭）');
    });

    onTestModel(async id => {
        const t0 = globalThis.performance?.now?.() ?? Date.now();
        try {
            const text = await requestCompletion(
                [{ role: 'user', content: '只回复两个字：收到' }],
                { profileId: id || settings.profileId, maxTokens: 16 },
            );
            const ms = Math.round((globalThis.performance?.now?.() ?? Date.now()) - t0);
            return { ok: true, ms, text: String(text ?? '').trim().slice(0, 20) };
        } catch (e) {
            return { ok: false, msg: e?.message ?? String(e) };
        }
    });

    onImportPack(async text => {
        let raw;
        try {
            raw = typeof text === 'string' ? JSON.parse(text) : text;
        } catch (e) {
            return { ok: false, msg: '不是合法 JSON：' + (e?.message ?? e) };
        }
        const r = addPack(registry, raw);
        if (!r.ok) {
            const first = r.errors?.[0];
            return { ok: false, msg: `${first?.path ?? '?'} ${first?.msg ?? '校验未通过'}` };
        }
        saveImportedPack(r.pack.id, raw);
        writeMeta({ packId: r.pack.id });
        composeAndInject();
        log('已导入世界包', r.pack.id);
        return { ok: true, id: r.pack.id, name: r.pack.name };
    });

    refreshPanel({ chatId: chatId(), messageCount: messages().length, profileId: settings.profileId, env: envInfo() });
    if (typeof eventSource?.on !== 'function') { log('事件源不可用，扩展只会显示面板'); refreshPanel({ env: envInfo() }); return; }
    try {
        eventSource.on(EV.CHAT_CHANGED, onChatChanged);
        eventSource.on(EV.GENERATION_AFTER_COMMANDS, () => {
            try {
                composeAndInject();
            } catch (e) {
                log('注入失败', e);
            }
        });
        eventSource.on(EV.MESSAGE_RECEIVED, () => {
            try {
                settleMessage();
                composeAndInject();
            } catch (e) {
                log('结算失败', e);
            }
        });
        eventSource.on(EV.MESSAGE_SWIPED, onChatChanged);
        eventSource.on(EV.MESSAGE_DELETED, onChatChanged);
    } catch (e) {
        log('事件注册失败', e);
    }
    log('loaded v' + VERSION);
}

// 点击委托：即使入口被重构过，只要 class 在就能开
document.addEventListener('click', ev => {
    const hit = ev.target?.closest?.('.story-ledger-open');
    if (!hit) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
        openDrawer();
    } catch (e) {
        log('打开面板失败', e?.message ?? e);
    }
}, true);

jQuery(async () => {
    await loadSTEvents();
    restoreImportedPacks();
    window.addEventListener('error', e => log('未捕获错误', e?.message));
    window.addEventListener('unhandledrejection', e => log('未处理的拒绝', e?.reason?.message ?? e?.reason));
    try {
        await loadBundledPacks();
        boot();
    } catch (e) {
        log('启动失败', e?.message ?? e, e?.stack ?? '');
    }
    window.addEventListener('beforeunload', () => closeDrawer());
});

/** ST 的 activate 钩子：hooks.activate 在 manifest 里声明 */
export function activate() {
    log('activate hook 被调用');
    try {
        mountFab();
        void injectStyles();
        void setupSettings();
    } catch (e) {
        log('activate 失败', e?.message ?? e);
    }
}

export { composeAndInject, settings };
