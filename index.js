// 叙事账本 · 入口
// 不静态 import script.js：新版 ST 若改名/挪位置，静态导入会让整个扩展加载失败。
// 改成运行时动态取，取不到就用字符串常量兜底——扩展至少能起来。
try { console.log('[叙事账本] module start'); } catch { /* noop */ }

import { VERSION } from './src/core/version.js';
import { mountPanel, refreshPanel, openDrawer, closeDrawer, onProfileChange, onReset } from './src/ui/panel.js';
import {
    ctx, chatId, messages, lastMessageIndex, readMeta, writeMeta,
    appendEvents, eventsByFloor, packMatchNames,
} from './src/adapters/st/context.js';
import { setStatePrompt, clearStatePrompt, setRawSlot } from './src/adapters/st/prompt.js';
import { transportAvailable, requestCompletion } from './src/adapters/st/llm.js';
import { createRegistry, addPack, resolvePack } from './src/core/pack/registry.js';
import { BUILTIN_PACK } from './src/core/pack/builtin.js';
import { fold } from './src/core/ledger/ledger.js';
import { openingMeta } from './src/core/runtime/opening.js';
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

function treeOf(pack) {
    const tree = createTree();
    for (const p of pack.places ?? []) putNode(tree, p);
    return tree;
}

function currentState() {
    const { pack } = ensurePack();
    const state = fold(readMeta()?.seed ?? { t: 0, place: null }, eventsByFloor());
    const meta = readMeta() ?? {};
    state.place = meta.placeId ?? state.place;
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
 * 挂入口。1.19 取消了 #extensionsMenu，改成把界面塞进 #extensions_settings。
 * 两种都试：老版本走菜单项，新版本走设置块。
 */
function mountMenu() {
    // 老版本：魔杖菜单里加一项
    const menu = document.getElementById('extensionsMenu');
    if (menu && !menu.querySelector('.' + MENU_CLASS)) {
        const item = document.createElement('div');
        item.className = 'extension_container interactable ' + MENU_CLASS;
        item.tabIndex = 0;
        item.innerHTML = '<div class="fa-solid fa-scroll fa-fw"></div><span>叙事账本</span>';
        item.addEventListener('click', () => openDrawer());
        menu.append(item);
        document.getElementById('story-ledger-fab')?.remove();
        return true;
    }
    if (menu) return true;

    // 1.19：扩展设置区里的一个块
    const host = document.getElementById('extensions_settings')
        ?? document.getElementById('extensions_settings2');
    if (!host) return false;
    if (host.querySelector('.' + MENU_CLASS)) {
        document.getElementById('story-ledger-fab')?.remove();
        return true;
    }

    const block = document.createElement('div');
    block.className = 'story-ledger-settings ' + MENU_CLASS;
    block.innerHTML = [
        '<div class="inline-drawer">',
        '  <div class="inline-drawer-toggle inline-drawer-header">',
        '    <b>叙事账本</b>',
        '    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>',
        '  </div>',
        '  <div class="inline-drawer-content">',
        `    <div class="sl-note">v${VERSION} · 状态账本（时间 / 地点 / 在场 / 好感 / 礼法 / 器物）</div>`,
        '    <div class="menu_button menu_button_icon story-ledger-open">',
        '      <i class="fa-solid fa-scroll"></i><span>打开面板</span>',
        '    </div>',
        '  </div>',
        '</div>',
    ].join('\n');
    block.querySelector('.story-ledger-open')?.addEventListener('click', () => openDrawer());
    host.append(block);

    // 折叠行为交给 ST 自己的 inline-drawer 处理；若没响应，点标题也能开
    block.querySelector('.inline-drawer-toggle')?.addEventListener('click', () => {
        block.querySelector('.inline-drawer-content')?.classList.toggle('displayNone');
    });
    document.getElementById('story-ledger-fab')?.remove();
    return true;
}

/** 兜底：右下角常驻小按钮，容器找不到时也能进面板 */
function mountFab() {
    if (document.getElementById('story-ledger-fab')) return true;
    const fab = document.createElement('div');
    fab.id = 'story-ledger-fab';
    fab.className = MENU_CLASS;
    fab.title = '叙事账本 v' + VERSION;
    fab.innerHTML = '<i class="fa-solid fa-scroll"></i>';
    fab.addEventListener('click', () => openDrawer());
    (document.body ?? document.documentElement).append(fab);
    return true;
}

/** 面板可能比扩展晚就绪，最多重试 40 次；始终失败就挂悬浮按钮 */
function mountMenuWithRetry(attempt = 0) {
    let ok = false;
    try {
        ok = mountMenu();
    } catch (e) {
        log('挂载入口失败', e?.message ?? e);
    }
    if (ok) return;
    if (attempt >= 40) {
        log('找不到扩展容器，改用悬浮按钮');
        mountFab();
        return;
    }
    setTimeout(() => mountMenuWithRetry(attempt + 1), 500);
}

function onChatChanged() {
    clearStatePrompt();
    composeAndInject();
}

function boot() {
    mountFab();            // 先保证有入口
    mountMenuWithRetry();  // 挂上正规入口后自动撤掉
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

jQuery(async () => {
    await loadSTEvents();
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

export { composeAndInject, settings };
