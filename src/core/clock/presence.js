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
];

// 句读：名字出现在这些字符之后，更像「新起的主语」
const SENTENCE_START = '。！？…”』」\n';

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
export function inferPresence(pack, text, { limit = 6, placeId = null, tree = null, extraAliases = null } = {}) {
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
        // ① 先看有没有说话/动作的证据（「霍振低声说」「知微，…」）
        const evidence = hasActionEvidence(t, alias);
        if (!evidence.hit) continue;
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
