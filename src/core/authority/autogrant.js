// 职权自动添加：正文里出现「某人+职位」时，按职位表给他一份职能
/** 职位 → 职能。只记「管哪一摊 + 能看/能动」，不记品级下属 */
export const TITLE_TABLE = [
    // 军中
    { re: /提督|总兵|参将|副将|游击|都司/, scopes: [['army', ['view', 'act']]], layer: 'core' },
    { re: /节度使/, scopes: [['army', ['view', 'act', 'delegate']]], layer: 'core' },
    { re: /千总|把总|百总|哨官|营官/, scopes: [['army', ['view']]], layer: 'core' },
    { re: /亲卫队长|亲卫|护卫|侍卫/, scopes: [['guard', ['view', 'act']]], layer: 'core' },

    // 朝中
    { re: /兵部尚书|兵部侍郎/, scopes: [['army', ['view']], ['court', ['view']]], layer: 'outer' },
    { re: /吏部尚书|吏部侍郎/, scopes: [['staff', ['view']], ['court', ['view']]], layer: 'outer' },
    { re: /户部尚书|户部侍郎|盐运使|度支/, scopes: [['ledger', ['view']], ['court', ['view']]], layer: 'outer' },
    { re: /礼部尚书|礼部侍郎|鸿胪寺卿|赞礼/, scopes: [['protocol', ['view']], ['court', ['view']]], layer: 'outer' },
    { re: /刑部尚书|刑部侍郎|大理寺卿|都察院|御史/, scopes: [['investigate', ['view']], ['court', ['view']]], layer: 'outer' },
    { re: /内阁大学士|大学士|首辅|中书舍人|翰林/, scopes: [['court', ['view']]], layer: 'outer' },
    { re: /尚书|侍郎|少卿|郎中|员外郎/, scopes: [['court', ['view']]], layer: 'outer' },

    // 地方
    { re: /知府|知州|刺史/, scopes: [['county', ['view', 'act']]], layer: 'outer' },
    { re: /知县|县令|县丞|主簿/, scopes: [['county', ['view']]], layer: 'outer' },
    { re: /里正|亭长|保长/, scopes: [['county', ['view']]], layer: 'outer' },

    // 宫中
    { re: /掌印太监|秉笔太监|太监|内侍|内监|尚宫|女官|嬷嬷/, scopes: [['palace', ['view']]], layer: 'core' },
    { re: /太医|御医|院判/, scopes: [['palace', ['view']]], layer: 'core' },

    // 草原
    { re: /可汗|台吉|部长|族长|千户|酋长/, scopes: [['grassland', ['view', 'act']]], layer: 'core' },
    { re: /马倌|马商|通译/, scopes: [['grassland', ['view']]], layer: 'core' },

    // 府内
    { re: /管家|总管|管事/, scopes: [['household', ['view']]], layer: 'core' },
    { re: /账房|帐房|司账/, scopes: [['ledger', ['view']]], layer: 'core' },
    { re: /厨子|厨役|灶上/, scopes: [['kitchen', ['view']]], layer: 'core' },
    { re: /掌柜|东家|牙人/, scopes: [['protocol', ['view']]], layer: 'outer' },
    { re: /幕僚|师爷|书记/, scopes: [['dispatch', ['view']]], layer: 'core' },
];

/** 名字里不该出现的字（虚词、动词、方位） */
const BAD = /[的了着是在有个和与把被让叫来去说道等都也就还只又及其之为任做当升补署旁站坐走看听殿外前后上下里中]/;

const NAME = /^[\u4e00-\u9fa5]{2,3}$/;

/** 名字前后必须是边界：标点、空白、句首句尾，或紧贴职位 */
const BOUNDARY_BEFORE = /[，。；：、！？\s「」『』（）()【】\n]|^/;
const CUE_AFTER_NAME = /^(?:是|任|为|做了|当|升|补|署理|暂代|名叫|叫)?$/;

function okName(cand) {
    return NAME.test(cand) && !BAD.test(cand);
}

/**
 * 从正文里找「某人 + 职位」。
 * 支持两种写法：`周崇，兵部侍郎` / `兵部侍郎周崇`。
 * @returns {Array<{name:string,title:string,scopes:Array,layer:string}>}
 */
export function detectOfficials(text, { knownNames = new Set(), limit = 3 } = {}) {
    const s = String(text ?? '');
    const out = [];
    const taken = [];   // 已占用的字符区间，避免「兵部侍郎」里再冒出「侍郎」

    const overlaps = (a, b) => !(a[1] <= b[0] || b[1] <= a[0]);

    for (const row of TITLE_TABLE) {
        const re = new RegExp(row.re.source, 'g');
        let m;
        while ((m = re.exec(s)) !== null) {
            const tStart = m.index;
            const tEnd = m.index + m[0].length;
            if (taken.some(r => overlaps(r, [tStart, tEnd]))) continue;

            // 这个职位已经吃掉了，短职位（侍郎）不能再在同一处匹配
            taken.push([tStart, tEnd]);

            // 1) 职位在前：`兵部侍郎周崇`（先用 3 字，不行退 2 字）
            let name = null;
            for (const len of [3, 2]) {
                const cand = s.slice(tEnd, tEnd + len);
                if (!NAME.test(cand) || !okName(cand)) continue;
                if (TITLE_TABLE.some(r => r.re.test(cand))) continue;
                name = cand;
                taken.push([tEnd, tEnd + len]);
                break;
            }

            // 2) 名字在前：`周崇，兵部侍郎` / `周崇是兵部侍郎` / `周崇兵部侍郎`
            if (!name) {
                const rawStart = Math.max(0, tStart - 8);
                const rawBack = s.slice(rawStart, tStart);
                // 只去掉尾部标点，前面的索引不变
                const back = rawBack.replace(/[，、；：\s]+$/, '');
                const cands = [...back.matchAll(/([\u4e00-\u9fa5]{2,3})(?:是|任|为|做了|当|升|补|署理|暂代|名叫|叫)?$/g)];
                for (const c of cands) {
                    const nm = c[1];
                    const abs = rawStart + c.index;
                    const prev = abs > 0 ? s[abs - 1] : '';
                    const gap = s.slice(abs + nm.length, tStart);
                    const adjacent = gap.length === 0;
                    if (!okName(nm)) continue;
                    if (!adjacent && !/[，、]/.test(gap)) continue;
                    if (!BOUNDARY_BEFORE.test(prev) && !adjacent) continue;
                    if (TITLE_TABLE.some(r => r.re.test(nm))) continue;
                    // 紧贴时：「兵部」+「侍郎」拼起来是更长的职位词 → 那是职位的前半截，不是名字
                    if (adjacent && TITLE_TABLE.some(r => r.re.test(nm + m[0]))) continue;
                    name = nm;
                    taken.push([abs, tEnd]);
                    break;
                }
            }

            if (!name) continue;
            if (knownNames.has(name)) continue;
            if (out.some(o => o.name === name)) continue;

            out.push({ name, title: m[0], scopes: row.scopes, layer: row.layer });
            if (out.length >= limit) return out;
        }
    }
    return out;
}

/** 把检测到的官员变成 grant 事件 */
export function officialToGrants(official) {
    return official.scopes.map(([scope, rights]) => ({
        k: 'grant',
        holder: official.name,
        scope,
        rights,
        source: `剧情·${official.title}`,
        layer: official.layer,
    }));
}

/** 面板/状态块用：一条授权的可读文本 */
export function describeGrant(grant, scopeLabel) {
    const label = typeof scopeLabel === 'function' ? scopeLabel(grant.scope) : grant.scope;
    const rights = (grant.rights ?? []).map(r => ({ view: '查看', act: '处置', delegate: '转授' }[r] ?? r)).join('·');
    return `${grant.holder} ${label}（${rights}）`;
}
