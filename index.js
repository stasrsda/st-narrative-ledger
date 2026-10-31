// 叙事账本 · 入口
// 不静态 import script.js：新版 ST 若改名/挪位置，静态导入会让整个扩展加载失败。
// 改成运行时动态取，取不到就用字符串常量兜底——扩展至少能起来。
try { console.log('[叙事账本] module start'); } catch { /* noop */ }

import { VERSION } from './src/core/version.js';
import { mountPanel, refreshPanel, openDrawer, closeDrawer, onProfileChange, onReset, onPackChange, onSaveProfile, onTestModel, onImportPack, onListModels, onSettleNow, onExportDiag, onOnstageChange, onStateDetailChange, onScrubChat, onDirectorChange, onActorHomeChange } from './src/ui/panel.js';
import {
    ctx, chatId, messages, lastMessageIndex, readMeta, writeMeta,
    appendEvents, eventsByFloor, packMatchNames,
} from './src/adapters/st/context.js';
import { setStatePrompt, clearStatePrompt, setRawSlot, configurePrompt, PROMPT_KEY_ADDR, PROMPT_KEY_FMT, PROMPT_KEY_DIRO } from './src/adapters/st/prompt.js';
import { transportAvailable, requestCompletion, requestCustom, probeModel, listModels } from './src/adapters/st/llm.js';
import { createRegistry, addPack, resolvePack } from './src/core/pack/registry.js';
import { BUILTIN_PACK } from './src/core/pack/builtin.js';
import { fold } from './src/core/ledger/ledger.js';
import { openingMeta, openingLabel } from './src/core/runtime/opening.js';
import { createTree, putNode, resolvePlaceName, mergeCustomPlaces, pathLabel } from './src/core/place/tree.js';
import { buildSceneBlock, onstageOf, pendingEvents, doneEventNames } from './src/core/runtime/scene.js';
import { parseHeader, rewriteHeader } from './src/core/clock/clock.js';
import { renderHeader } from './src/core/calendar/guofeng.js';
import { composeAddressBlock } from './src/core/compose/addressBlock.js';
import { buildOutline } from './src/core/runtime/director.js';
import { advanceTurn, renderAdvance } from './src/core/clock/auto.js';
import { parsePresence, stripPresence, resolveActors, inferPresence, parsePresenceComment, parsePresenceCommentDetailed, canBePresent, parseNewPlacesComment, parsePresenceFromThinking, parseCastFromThinking } from './src/core/clock/presence.js';
import { scrubText, scrubMessages } from './src/core/cleanup/scrub.js';
import { splitThinking, thinkingDominates, normalizeMessage, splitTailStory } from './src/core/cleanup/thinking.js';
import { detectOfficials, officialToGrants } from './src/core/authority/autogrant.js';
import { candidatesFor } from './src/core/codes/codes.js';
import { retrieveCodes } from './src/core/codes/retrieve.js';
import { createQueue } from './src/llm/queue.js';
import { buildSettleMessages } from './src/llm/prompt.js';
import { buildOutlineMessages, renderModelOutline } from './src/llm/outline.js';
import { buildTurnMessages, validateTurnPlan, renderTurnPlan } from './src/llm/turnPlan.js';
import { readLwbSummary, formatLwbBrief, lwbStats, lwbAliases, aliasMapForActors } from './src/core/memory/lwb.js';
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
            // 内置包如果比「以前导入过的」新，就用内置的（否则老包的旧数据会一直生效）
            const old = registry.packs?.[pack.id];
            if (old) {
                const a = Number(pack.revision ?? 0);
                const b = Number(old.revision ?? 0);
                if (b > a) {
                    log(`保留较新的导入包 ${pack.id}（r${b} > r${a}）`);
                    continue;
                }
                if (b === a && !pack.revision) {
                    // 两个都没有修订号：以内置为准（内置随插件升级）
                }
                log(`内置包更新：${pack.id} r${a} 覆盖 r${b}`);
            }
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

        // 这一轮的好感变化
        const changed = settleStatus.changed ?? [];
        push('好感变化', changed.length
            ? changed.map(x => `${x.name} ${x.from}→${x.to}`).join('｜')
            : '（这轮没有人变）');
        const dropped = settleStatus.dropped ?? [];
        if (dropped.length) {
            push('被丢弃的判定', dropped.map(d => `${d.raw}（${d.why}）`).join('｜'));
        }

        // 末楼事件明细
        const lastMsg = msgs[msgs.length - 1];
        const evs = lastMsg?.extra?.storyLedger?.events ?? [];
        if (evs.length) {
            lines.push('');
            lines.push('── 末楼事件 ──');
            for (const e of evs) {
                lines.push('  ' + JSON.stringify(e));
            }
        }
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

/**
 * 生成前：按「用户这一句」推进时间与地点。
 * 这样 AI 写的时候，[状态] 块里已经是新时间新地点，不会拿旧的写。
 */
function advanceFromUserInput() {
    try {
        const msgs = messages();
        let idx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i]?.is_user) { idx = i; break; }
        }
        if (idx < 0) return;
        const msg = msgs[idx];
        const text = String(msg.mes ?? '');

        // 已经算过这一楼就不再算（重试、刷新都会走到这里）
        const evs = msg?.extra?.storyLedger?.events ?? [];
        if (evs.some(e => e?.k === 'clock' && e?.src === 'input')) return;

        const { pack, state, meta } = currentState();

        // ① 地点：你的输入里提到地名就改
        try {
            const hit = resolvePlaceName(treeOf(pack), text);
            if (hit && hit.id !== (meta.placeId ?? state.place)) {
                writeMeta({ placeId: hit.id, placeName: hit.name });
                appendEvents(msg, [{ k: 'move', actor: 'user', place: hit.id, src: 'input' }]);
                log('按你的输入换地点：', hit.name);
            }
        } catch { /* noop */ }

        // ② 时间：按这一句估算耗时
        const step = advanceTurn(state.t ?? 0, text);
        appendEvents(msg, [{ k: 'clock', t: step.t, src: 'input' }]);
        writeMeta({ lastAdvance: { minutes: step.minutes, why: step.why, from: state.t, to: step.t } });
        log('按你的输入推进时间：', renderAdvance(step.minutes, step.why));
    } catch (e) {
        log('生成前推进失败', e?.message ?? e);
    }
}

/**
 * 生成前的一次总规划（合并版）：
 * 让副模型一次给出 时间跳转 / 换场 / 礼法 / 分镜，插件校验后执行。
 * 没开「副模型编排」或调用失败 → 回落规则推进（advanceFromUserInput）。
 */
let turnPlanCache = { key: '', text: '' };
async function composeTurnPlan() {
    const lastUser = [...messages()].reverse().find(m => m.is_user)?.mes ?? '';
    const cacheKey = `${chatId()}|${lastUser}`;

    // 规则先打底：时间地点即使模型不给，也要能走
    if (!settings.directorModel || !transportAvailable()) {
        advanceFromUserInput();
        return;
    }

    try {
        const { pack, state, meta } = currentState();
        const tree = treeOf(pack);
        const placeId = meta.placeId ?? state.place;
        const placeName = tree.nodes?.[placeId]?.name ?? meta.placeName ?? '';
        const onstage = onstageOf(pack, state, meta).map(o => o.name);
        const rule = buildOutline(pack, state, meta, lastUser, tree);

        const msgs = buildTurnMessages({
            userText: lastUser,
            placeName,
            onstage,
            places: Object.values(tree.nodes ?? {}).map(n => n.name),
            ruleOutline: rule.text,
            recent: [
                (state.emergent ?? []).slice(-2).map(e => e.name).join('、'),
                formatLwbBrief(readLwbSummary(ctx().chatMetadata)),
            ].filter(Boolean).join('\n'),
            timeText: renderHeader(state.t ?? 0, placeName, pack.calendar).replace(/[『』]/g, ''),
            prevLine: (meta.onstagePrev ?? [])
                .map(id => {
                    const nm = pack.index?.actor?.[id]?.name;
                    if (!nm) return '';
                    const note = meta.actorNote?.[id];
                    return note ? `${nm}(${note})` : nm;
                })
                .filter(Boolean)
                .join('、'),
        });

        const d2 = settings.direct ?? {};
        const res = d2.baseUrl && d2.model
            ? await requestCustom({ baseUrl: d2.baseUrl, apiKey: d2.apiKey, model: d2.model, messages: msgs, maxTokens: 400 })
            : await requestCompletion(msgs, { profileId: settings.profileId, maxTokens: 400 });

        const data = extractJsonSafe(res);
        const knownCodes = new Set(
            Object.values(pack.codes ?? {}).flat().map(c => c.id),
        );
        const plan = validateTurnPlan(data, {
            resolvePlace: (n) => resolvePlaceName(tree, n),
            knownCodes,
        });

        if (!plan.ok) {
            log('总规划没用（解析失败或空），回落规则推进');
            advanceFromUserInput();
            return;
        }

        // ① 时间：按模型给的分钟数推进（和规则一样走事件，方便回放）
        const msg = [...messages()].reverse().find(m => m.is_user);
        const evs = msg?.extra?.storyLedger?.events ?? [];
        const already = evs.some(e => e?.k === 'clock' && e?.src === 'plan');
        if (msg && !already) {
            if (plan.minutes > 0) {
                const nextT = (state.t ?? 0) + plan.minutes;
                appendEvents(msg, [{ k: 'clock', t: nextT, src: 'plan' }]);
                writeMeta({ lastAdvance: { minutes: plan.minutes, why: '副模型规划', from: state.t, to: nextT } });
                log('按规划推进时间：', plan.minutes, '分钟');
            }
            if (plan.place && plan.place.id !== placeId) {
                writeMeta({ placeId: plan.place.id, placeName: plan.place.name });
                appendEvents(msg, [{ k: 'move', actor: 'user', place: plan.place.id, src: 'plan' }]);
                log('按规划换场：', plan.place.name);
            }
        } else if (!msg) {
            advanceFromUserInput();
        }

        turnPlanCache = { key: cacheKey, text: renderTurnPlan(rule.text, plan) };
        log('本轮规划已生成：', `+${plan.minutes}分`, plan.place?.name ?? '', `${plan.beats.length} 个分镜`);
    } catch (e) {
        log('总规划失败，回落规则推进', e?.message ?? e);
        try { advanceFromUserInput(); } catch { /* noop */ }
    }
}

/**
 * 让副模型编排大纲（可选，settings.directorModel）。
 * ST 的 GENERATION_AFTER_COMMANDS 是 await 监听器的，所以这里等得起；
 * 失败/超时一律回落规则大纲，绝不阻塞生成。
 */
let modelOutlineCache = { key: '', text: '' };
let lastOutlineText = '';
async function composeModelOutline() {
    try {
        const { pack, state, meta } = currentState();
        if (!transportAvailable()) return;
        const d = settings.director ?? {};
        if (!d.baseUrl || !d.model) {
            if (!settings.profileId) return;
        }
        const lastUser = [...messages()].reverse().find(m => m.is_user)?.mes ?? '';
        const cacheKey = `${chatId()}|${lastUser}`;
        if (modelOutlineCache.key === cacheKey && modelOutlineCache.text) return;

        const tree = treeOf(pack);
        const onstage = onstageOf(pack, state, meta).map(o => o.name);
        const placeName = tree.nodes?.[meta.placeId ?? state.place]?.name ?? meta.placeName ?? '';
        const rule = buildOutline(pack, state, meta, lastUser, tree);

        const msgs = buildOutlineMessages({
            ruleOutline: rule.text,
            userText: lastUser,
            onstage,
            placeName,
            recent: [
                (state.emergent ?? []).slice(-2).map(e => e.name).join('、'),
                // 小白X 的剧情摘要：我们的免费模型本来拿不到，这里借过来
                formatLwbBrief(readLwbSummary(ctx().chatMetadata)),
            ].filter(Boolean).join('\n'),
        });

        const d2 = settings.direct ?? {};
        const res = d2.baseUrl && d2.model
            ? await requestCustom({ baseUrl: d2.baseUrl, apiKey: d2.apiKey, model: d2.model, messages: msgs, maxTokens: 260 })
            : await requestCompletion(msgs, { profileId: settings.profileId, maxTokens: 260 });

        const data = extractJsonSafe(res);
        const text = data ? renderModelOutline(data, rule.text) : '';
        if (text) {
            modelOutlineCache = { key: cacheKey, text };
            log('副模型大纲已生成', `${text.length} 字`);
        } else {
            log('副模型大纲解析失败，用规则大纲');
        }
    } catch (e) {
        log('副模型编排失败，用规则大纲', e?.message ?? e);
    }
}

function extractJsonSafe(text) {
    try {
        const s2 = String(text ?? '');
        const a = s2.indexOf('{');
        const b = s2.lastIndexOf('}');
        if (a < 0 || b <= a) return null;
        return JSON.parse(s2.slice(a, b + 1));
    } catch {
        return null;
    }
}

/**
 * 把 meta 里的角色覆盖（驻地/位份）写回包的 actor 对象。
 * 包每次加载是新的对象，所以这里改是安全的。
 */
function applyActorOverrides(pack, meta) {
    const home = meta?.actorHome ?? {};
    const rank = meta?.actorRank ?? {};
    for (const [id, placeId] of Object.entries(home)) {
        const a = pack.index?.actor?.[id];
        if (a) a.home = placeId;
    }
    for (const [id, r] of Object.entries(rank)) {
        const a = pack.index?.actor?.[id];
        if (a) a.rank = r;
    }
}

/** 面板：改某个角色的驻地 */
function setActorHome(id, placeId) {
    const meta = readMeta() ?? {};
    const home = { ...(meta.actorHome ?? {}) };
    if (placeId) home[id] = placeId;
    else delete home[id];
    writeMeta({ actorHome: home });
    log('驻地已改：', id, '→', placeId || '（清除）');
}

/** 改写消息内容后，让 ST 重新渲染（否则页面显示的还是旧 DOM） */
let repaintTimer = null;
function repaintChat() {
    if (repaintTimer) return;
    repaintTimer = setTimeout(() => {
        repaintTimer = null;
        try {
            const c = ctx();
            if (typeof c.printMessages === 'function') {
                c.printMessages();
                log('已请求 ST 重绘消息');
            }
        } catch (e) {
            log('重绘失败', e?.message ?? e);
        }
    }, 400);
}

/** 轻角色：临时出现的人，只有名字与身分 */
function addGuest(pack, guest) {
    if (!guest?.name) return;
    const meta = readMeta() ?? {};
    // 用户改过的驻地/位份：覆盖世界包里的值（下次读包也不用重导）
    try {
        applyActorOverrides(pack, meta);
    } catch (e) {
        log('应用角色覆盖失败', e?.message ?? e);
    }
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

/** 最后一条非空 AI 消息的内容（跳过空的、跳过用户的） */
function lastAiMessage() {
    try {
        const list = messages();
        for (let i = list.length - 1; i >= 0; i--) {
            const m = list[i];
            if (!m || m.is_user) continue;
            const t = String(m.mes ?? '').trim();
            if (t) return t;
        }
    } catch { /* noop */ }
    return '';
}

/** 取值包一层：出错就返回兜底值，不让整页诊断挂掉 */
function safeField(get, fallback) {
    try {
        const v = get();
        return v === undefined || v === null ? fallback : v;
    } catch {
        return fallback;
    }
}

/** 诊断信息：不依赖任何局部变量，任何地方都能调 */
function diagInfo() {
    try {
        const { pack, state, meta } = currentState();
        const metaHint = {
            onstage: meta?.onstage ?? [],
            lastEvents: (state.done?.length ?? 0) + (state.emergent?.length ?? 0),
            lastFirst: lastAiMessage().split('\n')[0].slice(0, 40),
            lastLen: lastAiMessage().length,
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
            packRev: pack?.revision ?? 0,
            actors: Object.keys(pack?.index?.actor ?? {}).length,
            sample: pack ? sampleAffinity(pack) : '无角色',
            onstage: (metaHint.onstage ?? []).join(',') || '（空）',
            lastEvents: metaHint.lastEvents ?? 0,
            affNow: metaHint.affSample || '（无）',
            onstageSrc: readMeta()?.onstageSrc ?? 'manual',
            placePathNow: safeField(() => {
                const tr1 = treeOf(pack);
                const id = readMeta()?.placeId ?? state.place;
                return id && tr1.nodes?.[id] ? pathLabel(tr1, id) : '';
            }, ''),
            books: worldBookNames(),
            lwb: { ...lwbStats(ctx().chatMetadata), aliases: lwbAliases(ctx().chatMetadata).length },
            places: safeField(() => {
                const tr0 = treeOf(pack);
                return Object.values(tr0.nodes ?? {}).map(n => ({
                    id: n.id,
                    name: n.name,
                    path: pathLabel(tr0, n.id),
                }));
            }, []),
            customPlaces: (readMeta()?.customPlaces ?? []).length,
            outline: lastOutlineText,
            hud: {
                on: (() => { try { return globalThis.localStorage?.getItem('storyLedger.hud') !== '0'; } catch { return true; } })(),
                onstage: (readMeta()?.onstage ?? []).length,
            },
            vars: syncChatVariables(state),
            actorList: Object.values(pack.index?.actor ?? {}).map(a => ({
                id: a.id,
                name: a.name,
                rank: a.rank,
                home: a.home ?? '',
                aff: state.aff?.[a.id] ?? a.aff ?? 0,
                on: (meta?.onstage ?? []).includes(a.id),
            })),
            directReady: Boolean(settings.direct?.baseUrl && settings.direct?.model),
            directInfo: {
                baseUrl: settings.direct?.baseUrl ?? '',
                model: settings.direct?.model ?? '',
                keyLen: (settings.direct?.apiKey ?? '').length,
                inLs: Boolean(lsGet()?.directModel?.model),
                inSt: Boolean(ctx()?.extensionSettings?.storyLedger?.directModel?.model),
            },
            keyLen: (settings.direct?.apiKey ?? '').length,
            profileId: settings.profileId,
        };
    } catch (e) {
        // 别让一个字段出错把整页诊断清空
        let first = '';
        let len = 0;
        try {
            const m = messages()[messages().length - 1];
            first = String(m?.mes ?? '').split('\n')[0].slice(0, 40);
            len = String(m?.mes ?? '').length;
        } catch { /* noop */ }
        return {
            packId: '读取失败', packName: String(e?.message ?? e),
            actors: 0, sample: '—',
            onstage: '（读不到）', lastEvents: 0, affNow: '—',
            onstageSrc: 'manual', books: [], lwb: {}, places: [],
            customPlaces: 0, outline: lastOutlineText,
            lastFirst: first, lastLen: len,
            hud: { on: true, onstage: 0 }, vars: {}, actorList: [],
            directReady: false, keyLen: 0, profileId: settings.profileId,
            err: String(e?.message ?? e),
        };
    }
}

/** 当前挂载的世界书名，用来发现「旧书没关」这类冲突 */
function worldBookNames() {
    try {
        const c = ctx();
        // 1.19 上 world_names 可能还没加载，优先用官方 getter
        const viaGetter = typeof c.getWorldInfoNames === 'function' ? c.getWorldInfoNames() : null;
        const names = viaGetter ?? c.world_names ?? c.worldNames
            ?? c.worldInfoSettings?.world_info
            ?? readMeta()?.world_info
            ?? [];
        const list = Array.isArray(names) ? names : (names ? [names] : []);
        return list.filter(Boolean);
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
    // 主模型自己造的地点（存在 meta.customPlaces）
    try {
        const custom = readMeta()?.customPlaces ?? [];
        if (custom.length) mergeCustomPlaces(tree, custom);
    } catch { /* noop */ }
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

    // 在场名单的优先级（从高到低）：
    //   ① 手动勾选 / 正文【在场】行  —— 直接写进 meta，这里不覆盖
    //   ② 结算报到（副模型判到谁）
    //   ③ 正文证据推断（说过话 / 做过动作）
    //   ④ 包的开局名单 —— 只在「从来没设置过」时用一次
    const openingList = basePack.opening?.onstage ?? [];
    if (!Array.isArray(meta.onstage)) {
        meta.onstage = openingList.length ? [...openingList] : [];
        log('首次设置在场名单（开局）：', meta.onstage.join(',') || '（空）');
    } else if (meta.onstage.length > 6) {
        // 超过 6 人截断，而不是整个重置 —— 重置会把你手动设的名单也冲掉
        meta.onstage = meta.onstage.slice(0, 6);
        log('在场名单超过 6 人，截断为：', meta.onstage.join(','));
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
    // 输出格式：让主模型在正文后写一行隐藏注释声明在场，插件解析后删掉
    const FORMAT_HINT = [
        '正文写完之后，另起一行写一行 HTML 注释，声明此刻在场的人：',
        '<!--在场:名字、名字-->',
        '只写名字，用顿号分隔；不在场的不要写；谁也不在就写 <!--在场:-->。',
        '这一行读者看不到，插件读完会删掉，不要写进正文，也不要解释它。',
    ].join('\n');
    // 注意：输出约定已写进状态块本身（depth 1），这里不再单独占一个槽，
    // 免得同一件事说两遍、还离新消息更远。

    const ok = settings.enabled && (setStatePrompt(block.text) || setRawSlot(block.text));

    // 导演层：把规则算出来的东西压成大纲，交给写作模型扩写
    let outline = null;
    try {
        if (settings.director !== false) {
            const lastUser = [...messages()].reverse().find(m => m.is_user)?.mes ?? '';
            outline = buildOutline(pack, state, meta, lastUser, tree);
            // 副模型规划过的话，用它的版本
            const lastU = [...messages()].reverse().find(m => m.is_user)?.mes ?? '';
            if (turnPlanCache.key === `${chatId()}|${lastU}` && turnPlanCache.text) {
                outline = { ...outline, text: turnPlanCache.text };
            } else if (modelOutlineCache.key === `${chatId()}|${lastU}` && modelOutlineCache.text) {
                outline = { ...outline, text: modelOutlineCache.text };
            }
            lastOutlineText = outline?.text ?? '';
            if (outline?.text && typeof setStatePrompt === 'function') {
                setStatePrompt(outline.text, { depth: 2, key: PROMPT_KEY_DIRO });
            }
        }
    } catch (e) {
        log('生成大纲失败', e?.message ?? e);
    }

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
    // ① 先切思考（标记 / 灰魂小标题 / 无标记三种都能认）
    const originalLen = String(msg.mes ?? '').length;
    const norm = normalizeMessage(msg.mes ?? '');
    let body = String(norm.body ?? '').trim();
    const thinking = String(norm.thinking ?? '').trim();

    if (norm.broken) {
        writeMeta({ lastBroken: { at: Date.now(), len: (msg.mes ?? '').length } });
        log('思考标记没有闭合：这一楼只有思考，没有正文');
    }
    if (thinkingDominates(thinking, body)) {
        log('思考块比正文长很多：', `思考 ${thinking.length} 字 / 正文 ${body.length} 字`);
    }

    // ② 思考一律搬进 extra.reasoning：界面折成灰块，正文里不再留标记
    //    这样 ST 不需要在「消息开头」找标记，也不会因为时间头挡在前面而解析失败
    // 思考未闭合（只有 <think> 没有 </think>）时不要动原文：
    // 那时候 body 是空的，一搬就会把整条正文搬进灰块，界面上看起来「正文全没了」
    if (thinking && !norm.broken) {
        msg.extra = msg.extra ?? {};
        const prev = String(msg.extra.reasoning ?? '');
        if (!prev.includes(thinking.slice(0, 40))) {
            msg.extra.reasoning = prev ? `${prev}\n\n${thinking}` : thinking;
        }
        log('思考已折进 reasoning：', `${thinking.length} 字`);
    }

    // ②.5 救援：正文可能整条裹在思考里（reasoning 里既有思考也有正文）
    //     这时候 body 是空的，只剩时间头，用户看到的就是「正文只有时间」
    if (body.trim().length < 40) {
        try {
            const prevReason = String(msg.extra?.reasoning ?? '');
            if (prevReason.length > 200) {
                const tail = splitTailStory(prevReason);
                if (tail.had && tail.body.length > 40) {
                    body = tail.body;
                    msg.extra = msg.extra ?? {};
                    msg.extra.reasoning = tail.thinking;
                    log('正文原本裹在思考里，已捞回：', `${tail.body.length} 字`);
                }
            }
        } catch (e) {
            log('从思考里捞正文失败', e?.message ?? e);
        }
    }

    // ③ 正文去掉旧时间头后重新写一遍（时间以插件为准）
    body = body.replace(/^[ \t]*『[^』]{6,60}』[^\n]*\n*/, '').trim();

    // 时间已经在「生成前」按用户输入推进过了（advanceFromUserInput），
    // 这里只取当前时间给时间头用，不再重复推进
    const step = { t: state.t ?? 0 };

    // 时间以插件为准：正文里若还留着旧时间头，用地名解析出来供地点更新
    let parsed = parseHeader(body, pack.calendar);

    // 时间头里写了地名 → 更新当前地点（地点是叙事推着走的，不该永远是开局那一个）
    if (parsed?.place) {
        try {
            const treeNow = treeOf(pack);
            const hit = resolvePlaceName(treeNow, parsed.place);
            const nowId = meta.placeId ?? state.place ?? null;
            if (hit && hit.id !== nowId) {
                writeMeta({ placeId: hit.id, placeName: hit.name });
                appendEvents(msg, [{ k: 'move', actor: 'user', place: hit.id, src: 'header' }]);
                log('地点更新', `${parsed.place} → ${hit.name}`);
            } else if (!hit) {
                log('地名认不出，保持原地点：', parsed.place);
            }
        } catch (e) {
            log('地点更新失败', e?.message ?? e);
        }
    }

    // ③.5 底单是 AI 自己贴的：只校验，不乱删
    //      （以前这里会把正文里的时间行全删掉，会把刚贴好的底单也删掉）
    try {
        const expected = String(readMeta()?.headerLine ?? '').trim();
        const firstLine = String(body ?? '').split('\n').map(x => x.trim()).find(Boolean) ?? '';
        const norm = (x) => x.replace(/[『』\s]/g, '');
        const wantNorm = norm(expected);
        if (expected && norm(firstLine).startsWith(wantNorm.slice(0, 12))) {
            log('AI 已按底单贴好时间头');
        } else if (expected && firstLine && /^『[^』]+』/.test(firstLine)) {
            // 贴了但写错（年份/时辰不对）→ 换成底单那一行
            const lines = String(body ?? '').split('\n');
            const idx = lines.findIndex(x => x.trim().length > 0);
            lines[idx] = expected;
            body = lines.join('\n');
            log('时间头与底单不符，已换成底单：', expected);
        } else if (expected) {
            body = `${expected}\n\n${String(body ?? '').trim()}`;
            log('AI 没贴底单，已补上：', expected);
        }
    } catch (e) {
        log('校验底单失败', e?.message ?? e);
    }

    // ④ 写回：正文由 AI 写（含底单），插件只在内容确实变了时才存
    try {
        const cleanBody = String(body ?? '').trim();
        const tooShort = cleanBody.length < 30 && originalLen > 120;
        if (tooShort) {
            log('正文切得太少，本楼不改写：', `正文 ${cleanBody.length} 字 / 原文 ${originalLen} 字`);
        } else if (cleanBody && msg.mes !== cleanBody) {
            msg.mes = cleanBody;
            try { ctx().saveChat?.(); } catch { /* noop */ }
            repaintChat();
            log('正文已写回：', `${cleanBody.length} 字`);
        }
    } catch (e) {
        log('写回正文失败', e?.message ?? e);
    }

    // 先清掉正文里的状态残留（<好感> 块、旧【在场】行等），避免它们跟着历史进上下文
    const scrubbed = scrubText(msg.mes ?? '');
    if (scrubbed.removed > 0) {
        msg.mes = scrubbed.text;
        log('清掉本楼状态残留', scrubbed.removed, '处');
        try { ctx().saveChat?.(); } catch { /* noop */ }
        repaintChat();
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

    // 主模型新造的地点：收进地点表（只增不改，重的跳过）
    try {
        const fresh = parseNewPlacesComment(msg.mes ?? '');
        if (fresh?.length) {
            const meta2 = readMeta() ?? {};
            const list = Array.isArray(meta2.customPlaces) ? [...meta2.customPlaces] : [];
            const treeNow = treeOf(pack);
            let added = 0;
            for (const f of fresh) {
                const name = String(f.name ?? '').trim();
                if (!name) continue;
                const exists = Object.values(treeNow.nodes ?? {}).some(n => n.name === name)
                    || list.some(c => c.name === name);
                if (exists) continue;
                const parentNode = f.parent ? resolvePlaceName(treeNow, f.parent) : null;
                list.push({
                    name,
                    parent: parentNode?.id ?? meta2.placeId ?? pack.opening?.place ?? null,
                    parentName: parentNode?.name ?? '',
                    scene: 'street',
                    at: Date.now(),
                });
                added++;
            }
            if (added) {
                writeMeta({ customPlaces: list });
                log('收下主模型新造的地点：', added, '个（共', list.length, '个）');
            }
        }
    } catch (e) {
        log('收新地点失败', e?.message ?? e);
    }

    // 在场：① 主模型的隐藏注释 > ② 旧【在场】行 > ③ 正文证据推断
    const declaredC = parsePresenceCommentDetailed(msg.mes ?? '');
    if (declaredC) {
        const names = declaredC.entries.map(e => e.name);
        const { ids } = resolveActors(pack, names);
        if (ids.length) {
            writeMeta({ onstage: ids, onstageSrc: 'ai-comment' });
            log('主模型声明在场：', ids.join(','));
        } else if (names.length === 0) {
            writeMeta({ onstage: [], onstageSrc: 'ai-comment' });
            log('主模型声明：无人');
        }
        // 名字@地点 → 自动更新驻地（认不出的地点跳过，不覆盖）
        try {
            const treeNow = treeOf(pack);
            const home = { ...(readMeta()?.actorHome ?? {}) };
            let changed = 0;
            for (const e of declaredC.entries) {
                if (!e.place) continue;
                const mapped = resolveActors(pack, [e.name]);
                const id = mapped.ids?.[0];
                if (!id) continue;
                const hit = resolvePlaceName(treeNow, e.place);
                if (!hit) continue;
                if (home[id] !== hit.id) {
                    home[id] = hit.id;
                    changed++;
                }
            }
            if (changed) {
                writeMeta({ actorHome: home });
                log('按主模型的输出更新驻地：', changed, '人');
            }
        } catch (err) {
            log('更新驻地失败', err?.message ?? err);
        }
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
            repaintChat();
        }
    } else if (declared && declared.length === 0) {
        onIds = [];
    } else {
        const opts = {
            placeId: meta.placeId ?? state.place ?? null,
            tree: treeOf(pack),
            extraAliases: aliasMapForActors(pack, ctx().chatMetadata),
        };
        const clearedMap = readMeta()?.fugitivesCleared ?? {};
        const opts2 = { ...opts, cleared: clearedMap };
        const found = inferPresence(pack, body, opts2);
        // ① 思考里如果直接写了「在场：…」，那就是主模型的判断，最可信
        let fromThinking = [];
        try {
            const thinkText = msg.extra?.reasoning ?? thinking ?? '';
            const named = parsePresenceFromThinking(thinkText);
            // 「关键NPC分析」小节里的列表，也是主模型认为这一场有谁
            const cast = parseCastFromThinking(thinkText);
            const all = [...new Set([...named, ...cast])];
            // ③ 思考里提到的名字（宽松）：它写「家眷就是沈母、知微、知砚」这种也算
            const looseIds = inferPresence(pack, thinkText, { ...opts2, loose: true });
            const direct = all.length ? (resolveActors(pack, all).ids ?? []) : [];
            fromThinking = [...new Set([...direct, ...looseIds])];
            if (fromThinking.length) log('思考里提到的人：', fromThinking.join(','));
        } catch (e) {
            log('读思考里的在场失败', e?.message ?? e);
        }
        // ② 你（用户角色）永远在场：视角就在你身上
        const meIds = Object.values(pack.index?.actor ?? {}).filter(a => a.isUser).map(a => a.id);
        onIds = [...new Set([...meIds, ...fromThinking, ...found])];
        if (!found.length && !fromThinking.length) {
            // 以前这里「沿用上一轮」，结果重生成之后名单一直是旧的（沈述在逃却一直在场）
            log('本楼没认出别人，只留你自己；名单已按本轮重算');
        } else {
            log('从正文推断在场：', found.join(','));
        }
    }
    if (onIds) {
        const prevList = readMeta()?.onstage ?? [];
        writeMeta({
            onstage: onIds,
            onstagePrev: Array.isArray(prevList) ? prevList : [],
            onstageSrc: onIds.length > 1 ? 'ai-evidence' : 'self',
        });
    }

    // 这一轮真把人拿住了：解除在逃状态（以后他就能正常出场）
    try {
        const grabbed = /拿下|押到|押上来|擒|抓住|捉住|捆了|绑了|扣了/.test(String(body ?? ''));
        if (grabbed && onIds?.length) {
            const meta2 = readMeta() ?? {};
            const clearedNow = { ...(meta2.fugitivesCleared ?? {}) };
            let changed = 0;
            for (const id of onIds) {
                const a = pack.index?.actor?.[id];
                if (a?.fugitive && !clearedNow[id]) {
                    clearedNow[id] = Date.now();
                    changed++;
                    log('已解除在逃：', a.name);
                }
            }
            if (changed) writeMeta({ fugitivesCleared: clearedNow });
        }
    } catch (e) {
        log('解除在逃失败', e?.message ?? e);
    }

    if (parsed) {
        const prev = meta.lastT ?? 0;
        appendEvents(msg, [{ k: 'clock', t: parsed.t, src: 'header' }]);
        writeMeta({ lastT: parsed.t, placeName: parsed.place || meta.placeName || '', backward: parsed.t < prev });
        const fixed = rewriteHeader(msg.mes, step.t, parsed.place || meta.placeName || '');
        if (fixed !== msg.mes) {
            msg.mes = fixed;
            try {
                ctx().saveChat?.();
                repaintChat();
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
        // 小白X 的别名也并进来：它认过的叫法比我们手写的准
        for (const [id, list] of aliasMapForActors(task.pack, ctx().chatMetadata)) {
            for (const a of list) if (!aliasMap.has(a)) aliasMap.set(a, id);
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
            // 结算的 note 存成每人一句极短注记（给「上场」行和副模型用）
        try {
            const notes = { ...(readMeta()?.actorNote ?? {}) };
            let n = 0;
            for (const r of parsed.data.results ?? []) {
                if (!r?.actor || !r?.note) continue;
                const txt = String(r.note).trim().slice(0, 12);
                if (!txt) continue;
                if (notes[r.actor] !== txt) { notes[r.actor] = txt; n++; }
            }
            if (n) writeMeta({ actorNote: notes });
        } catch (e) {
            log('存注记失败', e?.message ?? e);
        }

        const seen = [...(parsed.data.results ?? []), ...(parsed.data.beats ?? [])]
                .map(x => x.actor)
                .filter(Boolean);
            if (seen.length) {
                const meta = readMeta() ?? {};
                const list = Array.isArray(meta.onstage) ? [...meta.onstage] : [];
                let added = 0;
                const { pack: pk2, state: st2 } = currentState();
                const tree2 = treeOf(pk2);
                const placeNow = meta.placeId ?? st2.place;
                for (const id of new Set(seen)) {
                    if (list.includes(id)) continue;
                    // 门 1：在逃的人不算在场（除非这一轮被抓/被押/开口）
                    const a = pk2.index?.actor?.[id];
                    if (a?.fugitive && !/擒|押|抓住|捉|绑|捆|跪|开口|招了|供出/.test(body)) continue;
                    // 门 2：他得住得起这个地方（随行的除外）
                    try {
                        if (!canBePresent(a, { placeId: placeNow, tree: tree2 })) continue;
                    } catch { /* 判不了就放行 */ }
                    list.push(id);
                    added++;
                }
                if (added) {
                    writeMeta({ onstage: list, onstageSrc: 'settle' });
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
            repaintChat();
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
    const aiMsg = messages()?.[msgIndex] ?? null;
    const aiThinking = String(aiMsg?.extra?.reasoning ?? aiMsg?.extra?.thinking ?? '');
    const msgs = buildSettleMessages({ pack, state, onstage, userText, aiText, aiThinking, candidates });
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
            repaintChat();
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
            try {
                const back = lsGet()?.directModel ?? {};
                log('直连回读', `ls=${back.model || '空'}`, `st=${ctx()?.extensionSettings?.storyLedger?.directModel?.model || '空'}`);
            } catch { /* noop */ }
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
        repaintChat();
        composeAndInject();
        log('清理历史残留', r);
        return r;
    });

    onActorHomeChange((id, placeId) => {
        setActorHome(id, placeId);
        refreshPanel();
    });

    onDirectorChange(v => {
        settings.directorModel = Boolean(v);
        try { globalThis.localStorage?.setItem('storyLedger.directorModel', v ? '1' : '0'); } catch { /* noop */ }
        log('副模型编排大纲', v ? '开' : '关');
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
        eventSource.on(EV.GENERATION_AFTER_COMMANDS, async () => {
            try {
                await composeTurnPlan();
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
