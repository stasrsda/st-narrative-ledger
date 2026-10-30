// 审稿人（纯规则，不调模型）
const VAGUE = ['仿佛', '好像', '如同', '似乎', '近乎', '一丝'];

// 模型在正文里自言自语（不是剧情）
const META_TALK = [
    /被截断/g, /字数不够/g, /字数不足/g, /我需要继续/g, /接下来该写/g,
    /这段太短/g, /重新生成/g, /我需要写\d+/g,
];

const END_OK = /[。！？…”」』）】\.!?"')]$/;
const END_BAD = /[，、；：,;:—…「『（【]$/;
// 以「状态块/记录块」收尾不算截断
const TAG_END = /<\/[^>]{1,12}>\s*$|【[^】]{1,12}】\s*$/;

/**
 * 看起来被截断了：结尾既不是句读，又断在逗号/顿号/半句上。
 * 正常结尾允许省略号、引号收尾。
 */
export function looksTruncated(text) {
    const s = String(text ?? '').trim();
    if (!s) return false;
    if (END_OK.test(s)) return false;
    if (TAG_END.test(s)) return false;   // 以 </content> 收尾是正常结束
    if (END_BAD.test(s)) return true;
    // 结尾没有句读、又不是正常收尾符号：超过 20 字基本就是断了
    return s.length > 20;
}

export function reviewText({ text, userInput = '', pack = null, state = null }) {
    const out = [];
    const s = String(text ?? '');
    const first = s.split('\n')[0] ?? '';

    if (!/[『「].+?[』」]/.test(first)) {
        out.push({ code: 'no_header', level: 'warn', msg: '首行缺时间头' });
    }
    const score = s.match(/好感\s*[+\-−]?\s*\d+/);
    if (score) {
        out.push({ code: 'aff_leak', level: 'error', msg: '正文里出现了好感分数', quote: score[0] });
    }
    for (const w of VAGUE) {
        const hit = s.indexOf(w);
        if (hit >= 0) {
            out.push({ code: 'vague', level: 'warn', msg: `模糊词「${w}」`, quote: s.slice(Math.max(0, hit - 6), hit + 6) });
            break;
        }
    }
    for (const re of META_TALK) {
        const m = s.match(re);
        if (m) {
            out.push({
                code: 'meta_talk',
                level: 'warn',
                msg: '正文里出现了模型的自我叙述（不是剧情）',
                quote: m[0],
            });
            break;
        }
    }

    if (looksTruncated(s)) {
        out.push({
            code: 'truncated',
            level: 'warn',
            msg: '疑似被截断：结尾没有句读',
            quote: s.slice(-18),
        });
    }

    const echo = echoOfUser(userInput, s);
    if (echo) {
        out.push({ code: 'echo_user', level: 'warn', msg: '复述了玩家原话', quote: echo });
    }
    if (state?.rank && pack) {
        // 位份与称呼错配（粗查：称「王爷」但位份是君/亲）
        for (const [id, rankId] of Object.entries(state.rank)) {
            const r = pack.ranks?.[rankId];
            const name = pack.index?.actor?.[id]?.name;
            if (!r || !name) continue;
            if (r.address && r.address !== '王爷' && s.includes(`${name}叫`) && s.includes(r.address) === false) {
                out.push({ code: 'address_mismatch', level: 'info', msg: `${name} 的称呼可能不符位份` });
            }
        }
    }
    return out;
}

/** 玩家说了 ≥minLen 字，模型原样重复了 */
export function echoOfUser(userInput, text, minLen = 6) {
    const strip = s => String(s ?? '')
        .replace(/\s+/g, '')
        .replace(/[「」『』"'“”，。！？、；：·]/g, '');
    let u = strip(userInput);
    // 去掉“我说 / 我道 / 我告诉他”这类引述前缀，只比话本身
    u = u.replace(/^(我(?:说|道|讲|问|答)(?:了)?|我告诉[他她]|回答说?|我说)/, '');
    const t = strip(text);
    if (u.length < minLen) return '';
    for (let i = 0; i + minLen <= u.length; i++) {
        const seg = u.slice(i, i + minLen);
        if (t.includes(seg)) return seg;
    }
    return '';
}

export function summarize(findings = []) {
    const err = findings.filter(f => f.level === 'error').length;
    const warn = findings.filter(f => f.level === 'warn').length;
    if (!findings.length) return '无异常';
    return `${err} 错 / ${warn} 警`;
}
