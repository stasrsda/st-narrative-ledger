// 审稿人（纯规则，不调模型）
const VAGUE = ['仿佛', '好像', '如同', '似乎', '近乎', '一丝'];

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
