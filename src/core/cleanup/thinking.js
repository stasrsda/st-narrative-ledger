// 分离思考块与正文：时间头、在场、截断判断都只认正文
const PATTERNS = [
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
    return { body: s.trim(), thinking: thinking.trim(), had };
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
    if (!r.had) return { ...r, recovered: false };

    const body = (r.body ?? '').trim();
    const thinking = (r.thinking ?? '').trim();
    const bodyLen = body.length;
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
