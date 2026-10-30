// 清理历史消息里的状态残留：<好感> 块、【在场】行、误写进正文的状态块
// 预设脚手架：只去掉标签与注释，**保留里面的文字**
// （<记录> 里的摘要是有用的东西，不能连内容一起删）
const SCAFFOLD = [
    /<!--[\s\S]*?-->/g,                                  // HTML 注释：页面上本来就不显示
    /<\/?(?:content|记录|状态栏|状态|status)>/g,            // 只去掉标签本身
];

function stripScaffold(text) {
    let out = String(text ?? '');
    let n = 0;
    for (const re of SCAFFOLD) {
        out = out.replace(re, () => {
            n++;
            return '';
        });
    }
    return { text: out.replace(/\n{3,}/g, '\n\n').trim(), removed: n };
}

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
    const sc = stripScaffold(out);
    out = sc.text;
    removed += sc.removed;
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
