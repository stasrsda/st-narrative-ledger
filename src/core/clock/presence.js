import { ancestors } from '../place/tree.js';

// 说话 / 动作 / 对白：这些才是「人在场」的证据
const SPEECH_CUES = [
    '说', '道', '问', '答', '应', '喊', '叫', '笑', '叹', '吼', '低声', '沉声', '自语',
    '看', '望', '望向他', '回头', '抬手', '抬眼看', '点头', '摇头', '皱眉', '沉默',
    '走', '站', '坐', '跪', '行礼', '抱拳', '拱手', '躬身', '退', '进', '上前',
    '接过', '递', '伸手', '按刀', '翻', '掀', '拉', '推', '扶',
    '把', '将', '在', '正', '便', '就', '也', '又', '拿', '捧', '端', '抱', '提', '牵',
    '呈', '拟', '记', '写', '低头', '起身', '坐下', '没接话', '不答',
    '没有说话', '没说话', '不作声', '不响', '未答', '沉默',
    '被押', '押上来', '押到', '被擒', '被捕', '绑', '捆', '扣下',
];

// 句读：名字出现在这些字符之后，更像「新起的主语」
const SENTENCE_START = '。！？…”』」\n';

// 半在场也算：门外/帘后/隔屏/侧间/廊下——这些人仍在场
const HALF_PRESENT = /门外|门外头|廊下|檐下|帘|屏|帐|隔|侧间|偏间|窗外|墙外|院子|天井|外间|厢房/;

// 间接出现不算：派人、送信、那边的人、听说
const INDIRECT = [
    /派[人了个]/,
    /叫[人了个]/,
    /让[人了个]/,
    /命[人令]/,
    /打发/,
    /送[信话]/,
    /传[话信]/,
    /那边/,
    /的(人|货|信|伙计|手下|商队|铺子|家丁)/,
    /听说|据说|传闻|传言/,
];

/**
 * 这个名字是不是「间接出现」（只被提到，人不在场）。
 * @returns {boolean}
 */
export function isIndirect(text, aliases) {
    const t = String(text ?? '');
    const VERB = /^(派|叫|让|命|打发|送信|送话|传话|传信|转告|捎信)/;
    for (const name of aliases) {
        if (!name || name.length < 2) continue;
        let from = 0;
        while (true) {
            const i = t.indexOf(name, from);
            if (i < 0) break;
            from = i + name.length;
            const after = t.slice(i + name.length, i + name.length + 6).trimStart();
            const pre = t.slice(Math.max(0, i - 6), i);
            // 名字后面紧跟「派人/叫人来/送信」→ 间接
            if (VERB.test(after)) return true;
            // 名字后面紧跟「那边/的人/的货/的信/的伙计」
            if (/^(那边|的人|的货|的信|的伙计|的手下|的商队|的铺子|的家丁)/.test(after)) return true;
            // 前面是「听说/据说/传闻」
            if (/听说|据说|传闻|传言/.test(pre)) return true;
        }
    }
    return false;
}

/** 半在场（门外、帘后…）：也算在场 */
export function isHalfPresent(text, aliases, span = 10) {
    const t = String(text ?? '');
    for (const name of aliases) {
        if (!name || name.length < 2) continue;
        let from = 0;
        while (true) {
            const i = t.indexOf(name, from);
            if (i < 0) break;
            from = i + name.length;
            const win = t.slice(Math.max(0, i - span), i + name.length + span);
            if (HALF_PRESENT.test(win)) return true;
        }
    }
    return false;
}

// 「这个人此刻在这儿」的线索词：在/来/到/站/坐/守/候/进/出/说/问/答/看/迎/送/跟/带
const NEAR_CUE = /[在来到站坐守候进出说问答看迎送往跟带把递拿跪起身走]|没有|沉默/;

/**
 * 名字附近有没有「人在这儿」的线索（前后 8 字内）。
 * 用来区分「崔掌柜那边的货」和「崔掌柜在柜后头站着」。
 */
export function hasNearCue(text, aliases, span = 8) {
    const t = String(text ?? '');
    for (const name of aliases) {
        if (!name || name.length < 2) continue;
        let from = 0;
        while (true) {
            const i = t.indexOf(name, from);
            if (i < 0) break;
            from = i + name.length;
            const after = t.slice(i + name.length, i + name.length + span);
            const before = t.slice(Math.max(0, i - span), i);
            if (NEAR_CUE.test(after) || NEAR_CUE.test(before)) return true;
            // 列举也算：前面有「是/有/包括/家眷/在场」这类引入，名字前后是顿号
            const enumCtx = /是|有|包括|以及|家眷|在场|人物|带|和/.test(
                t.slice(Math.max(0, i - 16), i),
            );
            const enumAfter = /^[、,，]/.test(after.trim());
            const enumBefore = /[、,，]$/.test(before.trim());
            if (enumCtx || enumAfter || enumBefore) {
                if (enumAfter || enumBefore) return true;
            }
        }
    }
    return false;
}

/**
 * 这个名字在正文里有「说话或动作」的证据吗？
 * @returns {{hit:boolean, why:string}}
 */
export function hasActionEvidence(text, aliases) {
    const t = String(text ?? '');
    for (const name of aliases) {
        if (!name || name.length < 2) continue;
        let from = 0;
        while (true) {
            const i = t.indexOf(name, from);
            if (i < 0) break;
            from = i + name.length;
            const after = t.slice(i + name.length, i + name.length + 6);
            const before = t.slice(Math.max(0, i - 6), i);
            // ① 名字 + 动作/说话
            if (SPEECH_CUES.some(c => after.startsWith(c) || after.includes(c))) {
                return { hit: true, why: `${name}${after.slice(0, 3)}` };
            }
            // ② 名字 + 冒号/引号 → 直接对白
            if (/^\s*[：:]\s*[「“"]/.test(after)) {
                return { hit: true, why: `${name}：…` };
            }
            // ③ 名字在句首（前面是句读或开头），后面紧跟逗号 → 主语
            const atStart = i === 0 || SENTENCE_START.includes(t[i - 1]);
            if (atStart && /^\s*[，,]/.test(after)) {
                return { hit: true, why: `${name}，…` };
            }
            // ④ 对话归属：「……」名字说
            if (/[」”"]\s*$/.test(before) && SPEECH_CUES.some(c => after.startsWith(c))) {
                return { hit: true, why: `…」${name}说` };
            }
        }
    }
    return { hit: false, why: '' };
}


// 在场行解析：主模型在正文前写【在场】名字、名字
export const PRESENCE_MARK = '【在场】';

const RE = /【在场】[ \t:：]*([^\n]*)/;

/** 从正文里取出【在场】那一行的人名数组（去重、去空） */
export function parsePresence(text) {
    const m = String(text ?? '').match(RE);
    if (!m) return null;          // 没写这一行 → null（区别于写了但为空）
    const raw = m[1] ?? '';
    const names = raw
        .split(/[、,，/｜|\s]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => !/^(无|无人|空|—|-)$/.test(s));
    return [...new Set(names)];
}

/** 去掉【在场】这一行（如果不想让它留在正文里） */
export function stripPresence(text) {
    return String(text ?? '').replace(/^[ \t]*【在场】[^\n]*\n?/m, '');
}

/**
 * 名字 → 角色 id。先精确匹配，再按包含匹配。
 * @returns {{ids:string[], unknown:string[]}}
 */
export function resolveActors(pack, names = []) {
    const actors = Object.values(pack?.index?.actor ?? {});
    const ids = [];
    const unknown = [];
    for (const raw of names) {
        const n = String(raw).trim();
        if (!n) continue;
        const exact = actors.find(a => a.name === n || a.id === n);
        if (exact) {
            if (!ids.includes(exact.id)) ids.push(exact.id);
            continue;
        }
        const loose = actors.find(a => n.includes(a.name) || a.name.includes(n));
        if (loose) {
            if (!ids.includes(loose.id)) ids.push(loose.id);
        } else {
            unknown.push(n);
        }
    }
    return { ids, unknown };
}

/** 一行给人看的在场文本 */
export function renderPresence(pack, ids = []) {
    const names = ids.map(id => pack?.index?.actor?.[id]?.name ?? id);
    return PRESENCE_MARK + names.join('、');
}

/** 名字的别称：全名 + 去掉姓（如 沈知微 → 知微） */
function aliasesOf(actor) {
    const out = new Set();
    const n = String(actor?.name ?? '').trim();
    if (n.length >= 2) {
        out.add(n);
        if (n.length >= 3) out.add(n.slice(1));   // 去姓
        if (n.length >= 4) out.add(n.slice(-2));  // 末二字
    }
    return [...out];
}

/**
 * 从正文里推断谁在场：谁的名字（或别称）出现在这一楼里。
 * 不要求 AI 写任何标记行，也就不会往历史里留垃圾。
 * @returns {string[]} 角色 id（最多 limit 个）
 */
export function inferPresence(pack, text, { limit = 6, placeId = null, tree = null, extraAliases = null, loose = false, cleared = null } = {}) {
    const t = String(text ?? '');
    if (!t) return [];
    const hits = [];
    for (const actor of Object.values(pack?.index?.actor ?? {})) {
        // 只要不在自己够得着的地方，被提到也不算在场
        if (!canBePresent(actor, { placeId, tree })) continue;
        const alias = [
            ...aliasesOf(actor),
            ...((extraAliases?.get?.(actor.id)) ?? []),   // 小白X 认过的叫法
        ];
        // 间接出现（派人送信、那边的人、听说）一律不算
        if (isIndirect(t, alias)) continue;
        // 在逃的人：除非这一轮被抓/被押/开口，否则不算在场
        const caughtCue = /擒|押|抓住|捉|绑|捆绑|跪|开口|招了|供出|拿下|扣了/.test(t);
        const isCleared = Boolean(cleared?.has?.(actor.id) || cleared?.[actor.id]);
        if (actor.fugitive && !isCleared && !caughtCue) continue;
        // ① 先看有没有说话/动作的证据（「霍振低声说」「知微，…」）
        //    loose 模式（用于思考）：提到就算候选，靠驻地与在逃门兜过滤
        if (!loose) {
            // 半在场也算
            if (isHalfPresent(t, alias, 10)) {
                if (!hits.includes(actor.id)) hits.push(actor.id);
                continue;
            }
            const evidence = hasActionEvidence(t, alias);
            if (!evidence.hit) continue;
        } else {
            // loose（思考）：光是提到不算，附近得有「人在这儿」的线索
            const mentioned = alias.some(a => a.length >= 2 && t.includes(a));
            if (!mentioned) continue;
            // 半在场（门外/帘后/隔屏）直接算
            if (isHalfPresent(t, alias, 10)) {
                if (!hits.includes(actor.id)) hits.push(actor.id);
                continue;
            }
            // 走商队/流动的人（roaming）：窗口更窄，必须紧挨着在场动词
            const span = actor.roaming ? 5 : 8;
            if (!hasNearCue(t, alias, span)) continue;
        }
        if (!hits.includes(actor.id)) hits.push(actor.id);
    }
    return hits.slice(0, limit);
}

/**
 * 这个人此刻「够得着」吗。
 * 规则：随行的（travels）随便在哪都算；不随行的必须在自家驻地或其下辖地点。
 * 驻地为空（如皇兄在京城）→ 只能靠剧情/手动名单带进来。
 */
export function canBePresent(actor, { placeId = null, tree = null } = {}) {
    if (!actor) return false;
    // 随行的人（霍振、赵伯、秦铎这种跟着你走的）：哪都算，
    // 但 inferPresence 那边还有「必须有人在这儿的线索」，光提到不算
    if (actor.travels) return true;
    const home = actor.home;
    if (!home) return false;
    if (!placeId || !tree) return true;      // 没有位置信息时不拦
    if (home === placeId) return true;
    return ancestors(tree, placeId).includes(home);
}

/**
 * 主模型在正文末尾写的隐藏注释：
 *   <!--在场:霍振、沈知微-->
 *   <!-- 在场：霍振 / 沈知微 -->
 * 返回名字数组；没写返回 null（区别于写了空的）
 */
export function parsePresenceComment(text) {
    const t = String(text ?? '');
    const m = t.match(/<!--\s*(?:在场|出场|presence)\s*[:：]\s*([^>]*?)-->/i);
    if (!m) return null;
    const raw = m[1] ?? '';
    const names = raw
        .split(/[、,，/｜|\s]+/)
        .map(x => x.trim())
        .filter(Boolean)
        .filter(x => !/^(无|无人|空|—|-|none)$/i.test(x));
    return [...new Set(names)];
}

/**
 * 带地点的在场注释：
 *   <!--在场:霍振@沈宅、沈母@沈宅、沈述@东南岔路-->
 *   <!--在场:霍振、沈母-->                      （不写地点也行）
 * @returns {{entries:{name:string, place:string}[], raw:string}|null}
 */
export function parsePresenceCommentDetailed(text) {
    const t = String(text ?? '');
    const m = t.match(/<!--\s*(?:在场|出场|presence)\s*[:：]\s*([^>]*?)-->/i);
    if (!m) return null;
    const raw = m[1] ?? '';
    const entries = raw
        .split(/[、,，/｜|\n]+/)
        .map(x => x.trim())
        .filter(Boolean)
        .filter(x => !/^(无|无人|空|—|-|none)$/i.test(x))
        .map(x => {
            const [nm, pl] = x.split('@');
            return { name: String(nm ?? '').trim(), place: String(pl ?? '').trim() };
        })
        .filter(e => e.name);
    return { entries, raw };
}

/**
 * 主模型自己造的地点：
 *   <!--新地:东南岔路>雁回县、城西破庙>雁回县-->
 * 也接受 `名字（父名）`、只写 `名字`（父级留空）。
 * @returns {{name:string, parent:string}[]|null}
 */
export function parseNewPlacesComment(text) {
    const t2 = String(text ?? '');
    const m = t2.match(/<!--\s*(?:新地|新地点|newplaces?)\s*[:：]\s*([\s\S]*?)-->/i);
    if (!m) return null;
    return (m[1] ?? '')
        .split(/[、,，/｜|\n]+/)
        .map(x => x.trim())
        .filter(Boolean)
        .filter(x => !/^(无|空|—|-|none)$/i.test(x))
        .map(x => {
            let name = x;
            let parent = '';
            const gt = x.split(/[>》〉]/);
            if (gt.length > 1) {
                name = gt[0].trim();
                parent = gt[1].trim();
            } else {
                const par = x.match(/^(.+?)[（(](.+?)[）)]$/);
                if (par) { name = par[1].trim(); parent = par[2].trim(); }
            }
            return { name, parent };
        })
        .filter(x => x.name && x.name.length <= 12);
}

/**
 * 从思考里抠「在场」名单。灰魂的思考常写：
 *   在场：霍振、沈知微
 *   在场人物：沈母、知砚
 *   当前在场 - 白景昭 / 霍振
 */
export function parsePresenceFromThinking(text) {
    const t = String(text ?? '');
    const m = t.match(/(?:当前)?在场(?:人物|的人)?\s*[:：\-—]\s*([^\n]{2,60})/);
    if (!m) return [];
    return (m[1] ?? '')
        .split(/[、,，/｜|]+/)
        .map(x => x.trim().replace(/[（(].*?[）)]/g, '').trim())
        .filter(Boolean)
        .filter(x => x.length >= 2 && x.length <= 6)
        .filter(x => !/^(无|无人|空|无其他|其余)$/.test(x));
}

/**
 * 思考里的「关键NPC分析 / 人物」小节：
 *   * 关键NPC分析
 *      - 霍振：执行者，不多话
 *      - 沈知微：护家
 * 这种列表就是主模型认为「这一场有谁」。
 */
export function parseCastFromThinking(text) {
    const t2 = String(text ?? '');
    const m = t2.match(/(?:关键\s*NPC|人物安排|本场人物|出场人物)[^\n]*\n([\s\S]*?)(?=\n\s*\*\s|\n\s*#|$)/i);
    if (!m) return [];
    const out = [];
    for (const line of m[1].split('\n')) {
        const mm = line.match(/^\s*[-*·]\s*([^：:，,（(]{2,6})[：:]/);
        if (!mm) continue;
        const name = mm[1].trim();
        if (/^(主人|玩家|我|他|她)$/.test(name)) continue;
        if (!out.includes(name)) out.push(name);
    }
    return out;
}
