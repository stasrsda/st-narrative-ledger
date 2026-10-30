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
