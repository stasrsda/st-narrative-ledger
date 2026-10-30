// 叙事账本 · 入口
// 不静态 import script.js：新版 ST 若改名/挪位置，静态导入会让整个扩展加载失败。
// 改成运行时动态取，取不到就用字符串常量兜底——扩展至少能起来。
try { console.log('[叙事账本] module start'); } catch { /* noop */ }

import { VERSION } from './src/core/version.js';
import { mountPanel, refreshPanel, openDrawer, closeDrawer, onProfileChange, onReset, onPackChange, onSaveProfile, onTestModel, onImportPack, onListModels, onSettleNow, onExportDiag, onOnstageChange, onStateDetailChange, onScrubChat } from './src/ui/panel.js';
import {
    ctx, chatId, messages, lastMessageIndex, readMeta, writeMeta,
    appendEvents, eventsByFloor, packMatchNames,
} from './src/adapters/st/context.js';
import { setStatePrompt, clearStatePrompt, setRawSlot, configurePrompt, PROMPT_KEY_ADDR } from './src/adapters/st/prompt.js';
import { transportAvailable, requestCompletion, requestCustom, probeModel, listModels } from './src/adapters/st/llm.js';
import { createRegistry, addPack, resolvePack } from './src/core/pack/registry.js';
import { BUILTIN_PACK } from './src/core/pack/builtin.js';
import { fold } from './src/core/ledger/ledger.js';
import { openingMeta, openingLabel } from './src/core/runtime/opening.js';
import { createTree, putNode } from './src/core/place/tree.js';
import { buildSceneBlock, onstageOf, pendingEvents, doneEventNames } from './src/core/runtime/scene.js';
import { parseHeader, rewriteHeader } from './src/core/clock/clock.js';
import { renderHeader } from './src/core/calendar/guofeng.js';
import { composeAddressBlock } from './src/core/compose/addressBlock.js';
import { advanceTurn, renderAdvance } from './src/core/clock/auto.js';
import { parsePresence, stripPresence, resolveActors, inferPresence } from './src/core/clock/presence.js';
import { scrubText, scrubMessages } from './src/core/cleanup/scrub.js';
import { splitThinking, thinkingDominates, normalizeMessage } from './src/core/cleanup/thinking.js';
import { detectOfficials, officialToGrants } from './src/core/authority/autogrant.js';
import { candidatesFor } from './src/core/codes/codes.js';
import { retrieveCodes } from './src/core/codes/retrieve.js';
import { createQueue } from './src/llm/queue.js';
import { buildSettleMessages } from './src/llm/prompt.js';
import { normalizeSettle } from './src/llm/schema.js';
import { toEvents } from './src/llm/settle.js';
import { reviewText, summarize, looksTruncated } from './src/core/review/review.js';

const MENU_CLASS = 'story-ledger-menu-item';
const registry = createRegistry();
const settings = { profileId: '', depth: 1, enabled: true, showAffNumbers: true, stateDetail: 'full', direct: { baseUrl: '', apiKey: '', model: '' } };

/** 最近一次结算的状态，显示在面板上——否则失败只能翻控制台 */
const settleStatus = { at: 0, ok: null, msg: '尚未结算', events: 0 };

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

/** 从 script.js 拿到的运行期信息 */
const ST_INFO = { version: '未知', promptTypes: null, promptRoles: null };

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

        // 版本与 prompt 常量都是 script.js 的导出，getContext() 上没有
        ST_INFO.version = mod.displayVersion ?? mod.currentVersion ?? '未知';
        ST_INFO.promptTypes = mod.extension_prompt_types ?? null;
        ST_INFO.promptRoles = mod.extension_prompt_roles ?? null;
        if (ST_INFO.promptTypes || ST_INFO.promptRoles) {
            configurePrompt({ types: ST_INFO.promptTypes, roles: ST_INFO.promptRoles });
        }
        log('ST 版本', ST_INFO.version);
    } catch (e) {
        log('script.js 取不到，用上下文或字符串常量', e?.message ?? e);
    }
}

/** 环境自检：面板里能看见，出问题不用翻控制台 */
function envInfo() {
    const c = ctx();
    return {
        st: ST_INFO.version !== '未知' ? ST_INFO.version : (c.version ?? '未知'),
        eventSource: typeof eventSource?.on === 'function',
        setPrompt: typeof c.setExtensionPrompt === 'function',
        promptTypes: Boolean(ST_INFO.promptTypes ?? c.extension_prompt_types),
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

/** localStorage 兜底：ST 设置偶尔会被重置，这里再存一份 */
const LS_KEY = 'storyLedger.settings';

function lsGet() {
    try {
        return JSON.parse(globalThis.localStorage?.getItem(LS_KEY) ?? '{}') ?? {};
    } catch {
        return {};
    }
}

function lsSet(patch) {
    try {
        const next = { ...lsGet(), ...patch };
        globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(next));
        return true;
    } catch {
        return false;
    }
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

/** 一次性导出诊断信息，便于排查（不含明文 key） */
function diagDump() {
    const lines = [];
    const push = (k, v) => lines.push(`${k}: ${v}`);
    try {
        const { pack, state, meta } = currentState();
        const tree = treeOf(pack);
        const msgs = messages();
        const lastUser = [...msgs].reverse().find(m => m.is_user)?.mes ?? '';
        const lastAi = msgs[msgs.length - 1]?.mes ?? '';
        const block = buildSceneBlock({
            pack, state, tree, chatSeed: chatId(),
            meta: { ...meta, hintText: lastUser + lastAi.slice(-200) },
            budget: 220,
        });

        push('插件版本', VERSION);
        push('ST 版本', ST_INFO.version);
        push('聊天', chatId());
        push('楼层', msgs.length);
        push('世界书', worldBookNames().join(' / ') || '（无）');
        push('当前包', `${pack?.name ?? '—'}（${pack?.id ?? '—'}）`);
        push('包内角色数', Object.keys(pack?.index?.actor ?? {}).length);
        push('基础好感', sampleAffinity(pack));
        push('meta.packId', meta?.packId ?? '（无）');
        push('meta.onstage', JSON.stringify(meta?.onstage ?? null));
        push('meta.placeId', meta?.placeId ?? '（无）');
        push('seed.t', meta?.seed?.t ?? '（无）');
        push('seed.aff', JSON.stringify(meta?.seed?.aff ?? null));
        push('此刻好感', JSON.stringify(
            Object.fromEntries(['huozhen', 'zhiwei'].map(id => [id, state.aff?.[id] ?? null]))
        ));
        push('已完成事件', (state.done ?? []).length);
        push('自生事件', (state.emergent ?? []).length);
        push('末楼事件数', (msgs[msgs.length - 1]?.extra?.storyLedger?.events ?? []).length);
        push('副模型', transportAvailable()
            ? (settings.direct?.model || settings.profileId ? '就绪' : '缺连接配置')
            : '不可用');
        push('直连', settings.direct?.baseUrl
            ? `${settings.direct.baseUrl} / ${settings.direct.model} / key长度 ${(settings.direct.apiKey ?? '').length}`
            : '未配置');
        push('连接配置', settings.profileId || '未填');
        push('结算', `${settleStatus.ok === null ? '待定' : settleStatus.ok ? '成功' : '失败'} · ${settleStatus.msg}`);
        lines.push('');
        lines.push('── 本轮注入 ──');
        lines.push(block.text);
    } catch (e) {
        lines.push('导出出错: ' + (e?.message ?? e));
        lines.push(String(e?.stack ?? ''));
    }
    return lines.join('\n');
}

/** 把状态写回聊天变量（aff_<id> 等），兼容读 getvar 的界面与世界书 */
function syncChatVariables(state) {
    try {
        const api = ctx().variables?.local;
        if (!api?.set) return 0;
        let n = 0;
        for (const [id, val] of Object.entries(state.aff ?? {})) {
            api.set(`aff_${id}`, String(val ?? 0));
            n++;
        }
        for (const [id, rank] of Object.entries(state.rank ?? {})) {
            if (rank) api.set(`rank_${id}`, String(rank));
        }
        return n;
    } catch (e) {
        log('写变量失败', e?.message ?? e);
        return 0;
    }
}

/** 好感视图：在场的一行 + 全量列表，给面板和底部好感条用 */
function affinityView(pack, state, meta) {
    // 档位按角色的 bond 选词：臣属/亲族不能用情爱那套（否则赵伯 70 会显示「深爱」）
    const bandOf = (v, bond = 'love') => {
        const table = (bond && bond !== 'love' ? pack.affinity?.[bond] : null) ?? pack.affinity?.ladder ?? [];
        const min = pack.affinity?.min ?? -100;
        const step = pack.affinity?.step ?? 10;
        const idx = Math.max(0, Math.min(table.length - 1, Math.floor((Math.max(min, Math.min(100, v)) - min) / step)));
        return table[idx] ?? '';
    };
    const onstageIds = (meta?.onstage ?? []).filter(id => pack.index?.actor?.[id]);
    const row = id => {
        const a = pack.index.actor[id];
        const aff = state.aff?.[id] ?? a.aff ?? 0;
        return { id, name: a.name, aff, bond: a.bond ?? 'love', band: bandOf(aff, a.bond ?? 'love') };
    };
    const barIds = onstageIds.filter(id => !pack.index.actor[id]?.isUser);

    return {
        fallback: false,

        bar: barIds.map(row),
        all: Object.keys(pack.index?.actor ?? {})
            .filter(id => !pack.index.actor[id]?.isUser)
            .map(row)
            .sort((x, y) => y.aff - x.aff),
    };
}

/**
 * 面板公共数据：全部自取值，任何地方调用都安全。
 * 以后新增字段只加在这里，避免再次出现「某个调用点缺变量」。
 */
function panelBase() {
    let label = '';
    try {
        const { pack } = ensurePack();
        label = openingLabel(pack);
    } catch { /* noop */ }
    return {
        packs: packChoices(),
        profiles: profileNames(),
        packError: packErrorText(),
        openingLabel: label,
        transport: !transportAvailable()
            ? '不可用'
            : (settings.direct?.model || settings.profileId ? '就绪' : '缺连接配置'),
        direct: settings.direct,
        diag: diagInfo(),
        aff: { ...affView(), isOpening: messages().filter(m => !m.is_user).length <= 1 },
        chatId: chatId(),
        messageCount: messages().length,
    };
}

/** 轻角色：临时出现的人，只有名字与身分 */
function addGuest(pack, guest) {
    if (!guest?.name) return;
    const meta = readMeta() ?? {};
    const guests = Array.isArray(meta.guests) ? [...meta.guests] : [];
    if (guests.some(g => g.name === guest.name)) return;
    guests.push({ ...guest, rank: guest.rank ?? '客', aff: 0, since: Date.now() });
    writeMeta({ guests: guests.slice(-40) });
    // 当场合进运行时包，本轮就能被在场推断认出来
    if (!pack.index.actor[guest.id]) {
        const actor = {
            id: guest.id, name: guest.name, aliases: [], rank: '客', aff: 0,
            bond: 'love', stance: 'beiliang_folk', knows: [], temper: 'timid',
            lines: [], beats: [], guest: true, title: guest.title,
        };
        pack.actors = [...pack.actors, actor];
        pack.index.actor = { ...pack.index.actor, [actor.id]: actor };
    }
}

/** 把 meta.guests 合进包（刷新页面后仍然认得出这些人） */
function withGuests(pack, meta) {
    const guests = meta?.guests ?? [];
    if (!guests.length) return pack;
    const actors = [...pack.actors];
    const index = { ...pack.index.actor };
    for (const g of guests) {
        if (!g?.name || index[g.id]) continue;
        const actor = {
            id: g.id, name: g.name, aliases: [], rank: '客', aff: 0,
            bond: 'love', stance: 'beiliang_folk', knows: [], temper: 'timid',
            lines: [], beats: [], guest: true, title: g.title,
        };
        actors.push(actor);
        index[actor.id] = actor;
    }
    return { ...pack, actors, index: { ...pack.index, actor: index } };
}

/** 好感视图（自取值版，任何地方都能调） */
function affView() {
    try {
        const { pack, state, meta } = currentState();
        return affinityView(pack, state, meta);
    } catch {
        return { bar: [], all: [] };
    }
}

/** 诊断信息：不依赖任何局部变量，任何地方都能调 */
function diagInfo() {
    try {
        const { pack, state, meta } = currentState();
        const metaHint = {
            onstage: meta?.onstage ?? [],
            lastEvents: (state.done?.length ?? 0) + (state.emergent?.length ?? 0),
            lastLen: (messages()[messages().length - 1]?.mes ?? '').length,
            lastThink: splitThinking(messages()[messages().length - 1]?.mes ?? '').thinking.length,
            lastBody: splitThinking(messages()[messages().length - 1]?.mes ?? '').body.length,
            lastCut: looksTruncated(splitThinking(messages()[messages().length - 1]?.mes ?? '').body),
            lastBroken: Boolean(readMeta()?.lastBroken),
            advance: readMeta()?.lastAdvance ?? null,
            affSample: ['huozhen', 'zhiwei']
                .filter(id => state.aff?.[id] != null)
                .map(id => `${id} ${state.aff[id]}`)
                .join(' / '),
        };
        return {
            packId: pack?.id ?? '—',
            packName: pack?.name ?? '—',
            actors: Object.keys(pack?.index?.actor ?? {}).length,
            sample: pack ? sampleAffinity(pack) : '无角色',
            onstage: (metaHint.onstage ?? []).join(',') || '（空）',
            lastEvents: metaHint.lastEvents ?? 0,
            affNow: metaHint.affSample || '（无）',
            onstageSrc: readMeta()?.onstageSrc ?? 'manual',
            books: worldBookNames(),
            hud: {
                on: (() => { try { return globalThis.localStorage?.getItem('storyLedger.hud') !== '0'; } catch { return true; } })(),
                onstage: (readMeta()?.onstage ?? []).length,
            },
            vars: syncChatVariables(state),
            actorList: Object.values(pack.index?.actor ?? {}).map(a => ({
                id: a.id,
                name: a.name,
                on: (meta?.onstage ?? []).includes(a.id),
            })),
            directReady: Boolean(settings.direct?.baseUrl && settings.direct?.model),
            keyLen: (settings.direct?.apiKey ?? '').length,
            profileId: settings.profileId,
        };
    } catch (e) {
        return { packId: '读取失败', packName: String(e?.message ?? e), actors: 0, sample: '—' };
    }
}

/** 当前挂载的世界书名，用来发现「旧书没关」这类冲突 */
function worldBookNames() {
    try {
        const c = ctx();
        const names = c.world_names ?? c.worldNames ?? [];
        return Array.isArray(names) ? names : [];
    } catch {
        return [];
    }
}

/** 诊断用：取两个角色的基础好感，看包读没读对 */
function sampleAffinity(pack) {
    const a = pack.index?.actor ?? {};
    const pick = ['huozhen', 'zhiwei'].filter(id => a[id]);
    if (!pick.length) return '无角色';
    return pick.map(id => `${a[id].name} ${a[id].aff}`).join(' / ');
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
    const { pack: basePack } = ensurePack();
    let meta = readMeta();
    if (!meta?.seed) {
        // 新聊天或从未设置过：直接落一份开局状态，避免出现「承平元年正月初一」
        const fresh = openingMeta(basePack);
        writeMeta(fresh);
        meta = { ...(readMeta() ?? {}), ...fresh };
        log('首次进入本聊天，已写入开局状态');
    }
    const state = fold(meta.seed, eventsByFloor());
    state.place = meta.placeId ?? meta.seed?.place ?? state.place;

    // 在场名单：meta 里没写、或者写了太多（>6）都回落到世界包的开局名单
    const openingList = basePack.opening?.onstage ?? [];
    if (!Array.isArray(meta.onstage) || meta.onstage.length === 0 || meta.onstage.length > 6) {
        if (openingList.length) {
            meta.onstage = [...openingList];
            log('在场名单异常，回落到开局：', openingList.join(','));
        }
    }
    const pack = withGuests(basePack, meta);
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
    const varCount = syncChatVariables(state);
    const block = buildSceneBlock({ pack, state, tree, chatSeed: chatId(), meta: { ...meta, hintText }, budget: Number.POSITIVE_INFINITY });   // 不设上限：一行都不丢
    const ok = settings.enabled && (setStatePrompt(block.text) || setRawSlot(block.text));

    // 称谓块：只有两个以上在场者才需要（§5.2）
    let addrText = '';
    try {
        const onstageView = onstageOf(pack, state, meta);
        const r = composeAddressBlock({
            onstage: onstageView.filter(o => !o.isUser).map(o => ({
                name: o.name,
                address: o.address,
                aff: o.aff,
            })),
            titlesMatrix: pack.titles?.matrix ?? {},
            userName: '白景昭',
        });
        addrText = r.text;
        setStatePrompt(addrText, { depth: 2, key: PROMPT_KEY_ADDR });
    } catch (e) {
        log('称谓块失败', e?.message ?? e);
    }

    refreshPanel({
        ...panelBase(),
        packId: pack.id,
        packName: pack.name,
        injected: Boolean(ok),
        tokens: block.tokens,
        dropped: block.dropped,
        block: block.text,
        pending: pendingEvents(pack, state, 6),
        done: doneEventNames(pack, state, 6),
        items: Object.values(state.items ?? {}),
    });
    return block;
}

/** 生成后：时间头 → 事件 → 重写首行 → 审稿 → 投递结算 */
function settleMessage() {
    const idx = lastMessageIndex();
    const msg = messages()[idx];
    if (!msg || msg.is_user) return;

    const { pack, state, meta } = currentState();
    // 思考块与正文分开：时间头、在场、截断判断都只认正文
    const norm = normalizeMessage(msg.mes ?? '');
    const body = norm.body;
    const thinking = norm.thinking;
    if (norm.broken) {
        writeMeta({ lastBroken: { at: Date.now(), len: (msg.mes ?? '').length } });
        log('思考标记没有闭合：这一楼只有思考，没有正文');
    }
    if (norm.recovered) {
        // 正文被塞进了思考块：提回来，并写回消息，否则用户默认折叠时看不到
        msg.mes = body;
        try { ctx().saveChat?.(); } catch { /* noop */ }
        log('正文原先在思考块里，已提回正文：', `${body.length} 字`);
    }
    if (thinkingDominates(thinking, body)) {
        log('思考块比正文长很多：', `思考 ${thinking.length} 字 / 正文 ${body.length} 字`);
    }

    // 时钟由插件推进：按这一轮的内容估算耗时，写一条 clock 事件
    const userTextForClock = messages()[idx - 1]?.mes ?? '';
    const step = advanceTurn(state.t ?? 0, userTextForClock + body);
    appendEvents(msg, [{ k: 'clock', t: step.t, src: 'auto' }]);
    writeMeta({ lastAdvance: { minutes: step.minutes, why: step.why, from: state.t, to: step.t } });
    log('时间推进', renderAdvance(step.minutes, step.why));

    let parsed = parseHeader(body, pack.calendar);
    if (!parsed) {
        // 模型没写或写坏了：用当前状态补一行，保证时地永远在
        const treeNow = treeOf(pack);
        const node = meta.placeId || state.place ? treeNow.nodes?.[meta.placeId ?? state.place] : null;
        const placeName = meta.placeName || node?.name || '';
        const header = renderHeader(step.t, placeName, pack.calendar);
        const thinkingPart = thinking ? `${thinking}\n\n` : '';
        msg.mes = header + '\n\n' + thinkingPart + String(body ?? '').trim();
        parsed = parseHeader(msg.mes, pack.calendar);
        log('模型没写时间头，已补：', header);
        try { ctx().saveChat?.(); } catch { /* noop */ }
        refreshPanel({ headerFixed: true });
    }

    // 先清掉正文里的状态残留（<好感> 块、旧【在场】行等），避免它们跟着历史进上下文
    const scrubbed = scrubText(msg.mes ?? '');
    if (scrubbed.removed > 0) {
        msg.mes = scrubbed.text;
        log('清掉本楼状态残留', scrubbed.removed, '处');
        try { ctx().saveChat?.(); } catch { /* noop */ }
    }

    // 职权自动添加：正文里出现「某人+职位」时，给他一份职能
    try {
        const known = new Set(Object.values(pack.index?.actor ?? {}).map(a => a.name));
        const officials = detectOfficials(msg.mes ?? '', { knownNames: known, limit: 3 });
        if (officials.length) {
            const evs = [];
            for (const o of officials) {
                evs.push(...officialToGrants(o));
                // 记成轻角色：只有名字与身分，没有好感档案
                addGuest(pack, { id: `guest_${o.name}`, name: o.name, title: o.title });
            }
            appendEvents(msg, evs);
            log('自动登记职权', officials.map(o => `${o.name}(${o.title})`).join('、'));
        }
    } catch (e) {
        log('职权自动添加失败', e?.message ?? e);
    }

    // 在场：优先用旧协议的【在场】行（兼容），否则从正文推断
    const declared = parsePresence(body);
    let onIds = null;
    if (declared && declared.length) {
        const { ids } = resolveActors(pack, declared);
        if (ids.length) onIds = ids;
        // 旧协议的行从正文里删掉，避免每楼留一条污染上下文
        const cleaned = stripPresence(msg.mes ?? '');
        if (cleaned !== msg.mes) {
            msg.mes = cleaned;
            try { ctx().saveChat?.(); } catch { /* noop */ }
        }
    } else if (declared && declared.length === 0) {
        onIds = [];
    } else {
        onIds = inferPresence(pack, body, { placeId: meta.placeId ?? state.place ?? null, tree: treeOf(pack) });
        if (!onIds.length) {
            // 这一楼没提到任何人（或被截断）→ 不要清空名单，沿用上一轮
            onIds = null;
            log('本楼没认出在场者，沿用上一轮名单');
        } else {
            log('从正文推断在场：', onIds.join(','));
        }
    }
    if (onIds && onIds.length) writeMeta({ onstage: onIds, onstageSrc: 'ai' });

    if (parsed) {
        const prev = meta.lastT ?? 0;
        appendEvents(msg, [{ k: 'clock', t: parsed.t, src: 'header' }]);
        writeMeta({ lastT: parsed.t, placeName: parsed.place || meta.placeName || '', backward: parsed.t < prev });
        const fixed = rewriteHeader(msg.mes, step.t, parsed.place || meta.placeName || '');
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
    const directReady = Boolean(settings.direct?.baseUrl && settings.direct?.model);
    const hasChannel = Boolean(settings.profileId || directReady);
    if (!pack) {
        settleStatus.msg = '没有世界包，跳过结算';
        settleStatus.ok = false;
    } else if (!transportAvailable()) {
        settleStatus.msg = 'ST 没有提供转发接口（getRequestHeaders 缺失）';
        settleStatus.ok = false;
    } else if (!hasChannel) {
        settleStatus.msg = '没配副模型（直连或连接配置都空着）';
        settleStatus.ok = null;
    } else {
        settleStatus.msg = '已投递，等待返回…';
        settleStatus.ok = null;
        enqueueSettle(idx, pack, state, userText, msg.mes);
    }
    refreshPanel({ settle: { ...settleStatus } });
}

const settleQueue = createQueue({
    handler: async task => {
        const d = settings.direct ?? {};
        const res = d.baseUrl && d.model
            ? await requestCustom({
                baseUrl: d.baseUrl,
                apiKey: d.apiKey,
                model: d.model,
                messages: task.messages,
                maxTokens: 400,
            })
            : await requestCompletion(task.messages, { profileId: settings.profileId });
        const actorIds = new Set(Object.keys(task.pack.index?.actor ?? {}));
        // 模型经常直接写中文名，这里建一张「名字/别称 → id」的表
        const aliasMap = new Map();
        for (const [id, a] of Object.entries(task.pack.index?.actor ?? {})) {
            aliasMap.set(id, id);
            if (a.name) aliasMap.set(a.name, id);
            for (const al of a.aliases ?? []) aliasMap.set(al, id);
        }
        const parsed = normalizeSettle(res, { actorIds, aliasMap, text: task.text });
        if (!parsed.ok) throw new Error(parsed.error);
        const events = toEvents(task.pack, task.state, parsed.data);
        if (!events.length) {
            settleStatus.at = Date.now();
            settleStatus.ok = true;
            settleStatus.msg = '通了，但这轮判定为无事件';
            settleStatus.events = 0;
            refreshPanel({ settle: { ...settleStatus } });
            return;
        }
        // 模型判到谁，说明谁在场 —— 自动补进名单
        try {
            const seen = [...(parsed.data.results ?? []), ...(parsed.data.beats ?? [])]
                .map(x => x.actor)
                .filter(Boolean);
            if (seen.length) {
                const meta = readMeta() ?? {};
                const list = Array.isArray(meta.onstage) ? [...meta.onstage] : [];
                let added = 0;
                for (const id of new Set(seen)) {
                    if (!list.includes(id)) { list.push(id); added++; }
                }
                if (added) {
                    writeMeta({ onstage: list });
                    log('结算补充在场', list.join(','));
                }
            }
        } catch { /* noop */ }

        // 把这一轮的好感变化算出来，写进状态给面板看
        try {
            const before = currentState().state.aff ?? {};
            const msgNow = messages()[task.msgIndex];
            const eventsNow = msgNow?.extra?.storyLedger?.events ?? [];
            const after = fold(readMeta()?.seed, eventsByFloor()).aff ?? {};
            const changed = [];
            for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
                const a = before[id] ?? task.pack.index?.actor?.[id]?.aff ?? 0;
                const b2 = after[id] ?? task.pack.index?.actor?.[id]?.aff ?? 0;
                if (a !== b2) changed.push({ name: task.pack.index?.actor?.[id]?.name ?? id, from: a, to: b2 });
            }
            settleStatus.changed = changed;
            settleStatus.dropped = parsed.data?.dropped ?? [];
            log('好感变化', changed.map(x => `${x.name} ${x.from}→${x.to}`).join('、') || '（无）');
        } catch (e) {
            log('计算好感变化失败', e?.message ?? e);
        }

        settleStatus.at = Date.now();
        settleStatus.ok = true;
        settleStatus.msg = '已应用 ' + events.length + ' 条';
        settleStatus.events = events.length;
        refreshPanel({ settle: { ...settleStatus } });
        const msg = messages()[task.msgIndex];
        // 重试会重新判定同一楼：先去掉上一次结算留下的事件，避免好感重复累加
        if (msg?.extra?.storyLedger?.events) {
            msg.extra.storyLedger.events = msg.extra.storyLedger.events.filter(e => e?.src !== 'settle');
        }
        appendEvents(msg, events);
        try {
            ctx().saveChat?.();
        } catch {
            /* noop */
        }
        composeAndInject();
    },
    retries: 2,
    onError: (e, task) => {
        log('结算失败', e?.message);
        settleStatus.at = Date.now();
        settleStatus.ok = false;
        settleStatus.msg = e?.message ?? String(e);
        settleStatus.events = 0;
        refreshPanel({ settle: { ...settleStatus } });
    },
});

function enqueueSettle(msgIndex, pack, state, userText, aiText) {
    const meta = readMeta() ?? {};
    const onstage = onstageOf(pack, state, meta);
    const rankIds = onstage.map(o => o.rank).filter(Boolean);
    const scene = state.place ? treeOf(pack).nodes?.[state.place]?.scene : null;
    // 先按场景/位份/正文关键词检索，只把最相关的 10 条交给副模型
    // （全量候选项有 40~60 条，全给会稀释判断，也白烧 token）
    const candidates = retrieveCodes(pack, {
        scene,
        rankIds,
        text: `${userText ?? ''}\n${aiText ?? ''}`,
        state,
    }, 10);
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
        const saved = ctx().extensionSettings?.storyLedger ?? {};
        const local = lsGet();
        const merged = {
            profileId: saved.profileId || local.profileId || '',
            directModel: { ...(local.directModel ?? {}), ...(saved.directModel ?? {}) },
        };
        if (merged.profileId) settings.profileId = merged.profileId;
        if (merged.directModel?.model || merged.directModel?.baseUrl) {
            settings.direct = { ...settings.direct, ...merged.directModel };
            log('读回直连配置', settings.direct.model || settings.direct.baseUrl);
        }
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
        refreshPanel({ ...panelBase(), profileId: id });
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
    onSaveProfile((id, direct) => {
        if (direct) {
            settings.direct = { ...direct };
            lsSet({ directModel: settings.direct });
            try {
                const c = ctx();
                const st = c.extensionSettings;
                if (st) {
                    st.storyLedger = { ...(st.storyLedger ?? {}), directModel: settings.direct };
                    c.saveSettingsDebounced?.();
                }
            } catch (e) {
                log('写 ST 设置失败（已存本地）', e?.message ?? e);
            }
            refreshPanel({ ...panelBase(), direct: settings.direct });
            log('直连已保存', settings.direct.model || '（空）');
            return;
        }
        settings.profileId = id;
        lsSet({ profileId: id });
        try {
            const c = ctx();
            const st = c.extensionSettings;
            if (st) {
                st.storyLedger = { ...(st.storyLedger ?? {}), profileId: id };
                c.saveSettingsDebounced?.();
            }
        } catch { /* noop */ }
        refreshPanel({ ...panelBase(), profileId: id });
        log('副模型已保存', id || '（关闭）');
    });

    onScrubChat(() => {
        const r = scrubMessages(messages());
        try { ctx().saveChat?.(); } catch { /* noop */ }
        composeAndInject();
        log('清理历史残留', r);
        return r;
    });

    onStateDetailChange(v => {
        settings.stateDetail = v;
        try { globalThis.localStorage?.setItem('storyLedger.stateDetail', v); } catch { /* noop */ }
        composeAndInject();
        log('状态块详细度', v);
    });

    onOnstageChange((id, on) => {
        const meta = readMeta() ?? {};
        const list = Array.isArray(meta.onstage) ? [...meta.onstage] : [];
        const has = list.includes(id);
        if (on && !has) list.push(id);
        if (!on && has) list.splice(list.indexOf(id), 1);
        writeMeta({ onstage: list });
        composeAndInject();
        log('在场名单更新', list.join(',') || '（空）');
    });

    onExportDiag(() => diagDump());

    onSettleNow(() => {
        const idx = lastMessageIndex();
        const msg = messages()[idx];
        if (!msg || msg.is_user) return { ok: false, msg: '最后一楼不是 AI 回复' };
        try {
            settleMessage();
            return { ok: true, msg: '已重新投递' };
        } catch (e) {
            return { ok: false, msg: e?.message ?? String(e) };
        }
    });

    onListModels(async direct => {
        try {
            const ids = await listModels({ baseUrl: direct?.baseUrl, apiKey: direct?.apiKey });
            return { ok: true, models: ids };
        } catch (e) {
            return { ok: false, msg: e?.message ?? String(e) };
        }
    });

    onTestModel(async (id, direct) => {
        if (direct) {
            return probeModel({
                baseUrl: direct.baseUrl,
                apiKey: direct.apiKey,
                model: direct.model,
            });
        }
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

    refreshPanel({ ...panelBase(), profileId: settings.profileId, env: envInfo() });
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
