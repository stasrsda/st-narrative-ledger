// 分离思考块与正文：时间头、在场、截断判断都只认正文
// DeepSeek 系列会把这些特殊标记原样写进正文
const DEEPSEEK_BEGIN = /<[｜|]begin[▁_]of[▁_]thinking[｜|]>/g;
const DEEPSEEK_END = /<[｜|]end[▁_]of[▁_]thinking[｜|]>/g;

// 灰魂预设的思考小标题：模型没写 <think> 时，靠这些认
const COT_HEADERS = [
    '* 灰魂吐槽', '* 输入分析', '* 情景思考', '* 深度求索', '* 情节推进',
    '* 文风规划', '* 质量检查', '* 关键NPC', '* 思辨脉络', '* 用户输入分析',
    '* 字数', '* 规划', '灰魂吐槽', '输入分析',
];

/** 这一段是不是思考小标题行 */
function isCotHeader(line) {
    const t = line.trim();
    if (!t || t.length > 30) return false;
    return COT_HEADERS.some(h => t.startsWith(h));
}

/** 正文行的特征：中文缩进（全角空格）、或『』时间头、或以引号开口 */
function looksLikeStory(line) {
    const t = line;
    return /^[\u3000]{1,2}\S/.test(t) || /^『/.test(t.trim()) || /^[「“"]/.test(t.trim());
}

/**
 * 把开头那段「思考小标题 + 若干条」切出来。
 * 触发条件：第一行（跳过时间头/空行）是 COT 小标题，且后面能找到正文行。
 * @returns {{body:string, thinking:string, had:boolean}}
 */
export function splitLooseCot(text) {
    const lines = String(text ?? '').split('\n');
    let i = 0;
    // 跳过时间头与空行
    while (i < lines.length && (/^[ \t]*『[^』]{6,60}』/.test(lines[i]) || lines[i].trim() === '')) i++;
    if (!isCotHeader(lines[i] ?? '')) return { body: text, thinking: '', had: false };

    // 从 i 开始找第一行「像正文」的
    let j = i;
    while (j < lines.length && !looksLikeStory(lines[j])) j++;
    if (j >= lines.length) return { body: text, thinking: '', had: false };

    const head = lines.slice(0, i).join('\n');
    const cot = lines.slice(i, j).join('\n');
    const story = lines.slice(j).join('\n');
    // 思考太短就不算（可能只是正文里提了一句）
    if (cot.length < 80) return { body: text, thinking: '', had: false };
    return { body: (head ? head + '\n\n' : '') + story, thinking: cot, had: true };
}

const PATTERNS = [
    { name: 'tag-think', re: /<think>([\s\S]*?)<\/think>/gi },
    { name: 'tag', re: /<思考>([\s\S]*?)<\/思考>/g },
    { name: 'tag2', re: /<thinking>([\s\S]*?)<\/thinking>/gi },
    { name: 'bracket', re: /【思考】([\s\S]*?)【\/思考】/g },
    { name: 'code', re: /```(?:think|thinking|思考)\s*([\s\S]*?)```/gi },
];

/**
 * @returns {{body:string, thinking:string, had:boolean}}
 * 正文 = 去掉思考块之后的部分
 */
export function splitThinking(text) {
    let s = String(text ?? '');
    let thinking = '';
    let had = false;
    let broken = false;

    // ① DeepSeek：<｜begin▁of▁thinking｜>…<｜end▁of▁thinking｜>
    if (DEEPSEEK_BEGIN.test(s)) {
        DEEPSEEK_BEGIN.lastIndex = 0;
        const endMatch = s.match(DEEPSEEK_END);
        if (endMatch) {
            const cut = s.indexOf(endMatch[0]);
            const start = s.search(DEEPSEEK_BEGIN);
            thinking += s.slice(start, cut).replace(DEEPSEEK_BEGIN, '');
            s = s.slice(0, start) + s.slice(cut + endMatch[0].length);
            had = true;
        } else {
            // 有开头没结尾：思考没闭合，正文未知
            broken = true;
            thinking += s.replace(DEEPSEEK_BEGIN, '');
            s = '';
            had = true;
        }
        DEEPSEEK_BEGIN.lastIndex = 0;
    }
    for (const { re } of PATTERNS) {
        s = s.replace(re, (_, inner) => {
            thinking += inner + '\n';
            had = true;
            return '';
        });
    }
    // 「思考：」开头的整段（到第一个空行为止），只在开头出现时算
    const lead = s.match(/^\s*(?:思考|思路|分析)\s*[:：]\s*([\s\S]*?)(?:\n\s*\n|$)/);
    if (lead && lead[0].length > 40) {
        thinking += lead[1] + '\n';
        had = true;
        s = s.slice(lead[0].length);
    }
    return { body: s.trim(), thinking: thinking.trim(), had, broken };
}

/** 只看正文里有没有时间头 */
export function headerInBody(body) {
    return /『[^』]{6,60}』/.test(String(body ?? ''));
}

/** 思考是否吃掉了大半输出 */
export function thinkingDominates(thinking, body) {
    const t = String(thinking ?? '').length;
    const b = String(body ?? '').length;
    return t > 200 && t > b * 1.5;
}

/**
 * 判断「正文是不是被塞进思考块了」。
 * 触发条件：正文极短（<40 字）而思考很长，或者时间头只出现在思考里。
 */
export function normalizeMessage(text) {
    const r = splitThinking(text);
    if (!r.had) {
        // 没有标记：看开头是不是灰魂的思考小标题
        const loose = splitLooseCot(text);
        if (loose.had) return { ...loose, broken: false, recovered: false, loose: true };
    }
    // 有 <think> 开头但没结尾：整段都是思考（ST 没解析成功时会出现）
    if (!r.had && /<think>/i.test(text) && !/<\/think>/i.test(text)) {
        return { body: '', thinking: String(text), had: true, broken: true, recovered: false };
    }
    if (!r.had) return { ...r, recovered: false };
    // 思考没闭合：正文根本不存在，不要拿思考当正文
    if (r.broken) return { ...r, recovered: false };

    const body = (r.body ?? '').trim();
    const thinking = (r.thinking ?? '').trim();
    // 先剥掉「时间头」「【在场】行」这类我们自己补进去的东西，再量正文长短
    const stripped = body
        .replace(/^[ \t]*『[^』]{6,60}』[^\n]*\n?/m, '')
        .replace(/^[ \t]*【在场】[^\n]*\n?/gm, '')
        .trim();
    const bodyLen = stripped.length;
    const thinkLen = thinking.length;
    const bodyNoHeader = !headerInBody(body);
    const thinkHasHeader = headerInBody(thinking);
    const thinkLong = thinkLen >= 120;

    // 1) 正文几乎空（<10 字），思考里有时间头或很长 → 整段提回
    if (bodyLen < 10 && (thinkHasHeader || thinkLong)) {
        return { body: thinking, thinking: '', had: true, recovered: true };
    }
    // 2) 正文很短，思考明显更长（两倍以上）→ 整段提回
    if (bodyLen < 40 && thinkLen > bodyLen * 2 && (thinkHasHeader || thinkLong)) {
        return { body: thinking, thinking: '', had: true, recovered: true };
    }
    // 3) 正文有内容但缺时间头，思考里有 → 只把时间头那一行并回开头
    if (bodyNoHeader && thinkHasHeader) {
        const m = thinking.match(/^[^\n]*『[^』]{6,60}』[^\n]*/m);
        if (m) {
            return { body: `${m[0]}\n\n${body}`, thinking, had: true, recovered: true };
        }
    }
    return { ...r, recovered: false };
}
