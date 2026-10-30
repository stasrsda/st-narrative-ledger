// 清理历史消息里的状态残留：<好感> 块、【在场】行、误写进正文的状态块
const PATTERNS = [
    /<好感>[\s\S]*?<\/好感>\s*/g,          // 旧世界书要求的输出块
    /^[ \t]*【在场】[^\n]*\n?/gm,           // 我们 0.7.x 的临时协议
    /^[ \t]*\[状态·只读·勿复述\][\s\S]*?与<info>冲突时以本块为准。\s*/gm,
    /<状态>[\s\S]*?<\/状态>\s*/g,
];

/** 清一条消息，返回 {text, removed} */
export function scrubText(text) {
    let out = String(text ?? '');
    let removed = 0;
    for (const re of PATTERNS) {
        out = out.replace(re, () => {
            removed++;
            return '';
        });
    }
    return { text: out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(), removed };
}

/** 批量清：接收消息数组，就地改，返回统计 */
export function scrubMessages(messages = []) {
    let lines = 0;
    let touched = 0;
    for (const m of messages) {
        if (!m || typeof m.mes !== 'string') continue;
        const r = scrubText(m.mes);
        if (r.removed > 0) {
            m.mes = r.text;
            lines += r.removed;
            touched++;
        }
    }
    return { messages: touched, blocks: lines };
}
