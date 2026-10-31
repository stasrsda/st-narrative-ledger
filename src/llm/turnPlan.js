// 一轮的总规划：时间跳转 + 地点 + 本场礼法 + 分镜
// 由副模型一次产出，插件负责校验（算错的数字、不认识的地名一律丢掉）
// 副模型上下文宽裕：把人物卡（含忌/职权/状态）、场景、礼法、事件、玩家处境都给它。
export function buildTurnMessages(brief = {}) {
    const {
        userText = '', placeName = '', placePath = '', sceneCn = '', timeText = '',
        onstage = [], prevLine = '', places = [], ruleOutline = '', recent = '', lastAi = '',
        cast = [], codes = [], events = {}, authority = [], player = {}, props = [],
        world = [], rounds = [], maxChars = 7000,
    } = brief;

    const sys = [
        '你在做一部中文古代小说的「这一轮场务安排」。只输出一个 JSON 对象，不要解释。',
        '',
        '字段：',
        '{',
        '  "minutes": 数字（这一轮该过去多少分钟；不确定就写 0）',
        '  "place": "地点名（只有玩家这一句明确要换地方时才填，否则留空）",',
        '  "codes": ["本场最可能触发的礼法 id，最多 2 个"],',
        '  "beats": [{"who":"谁","do":"做什么（≤18字）"}],',
        '  "hook": "末了留什么（≤18字，可观察的东西）"',
        '}',
        '',
        '规则：',
        '- minutes 只能填分钟数。跨日 1440，一个时辰 120，一刻 15，半个时辰 60。',
        '- 玩家说「次日/第二天」必须 ≥1440；说「一刻/马上」≤30；没提就按场景自然耗时（问话 ~30、抄家 ~60、赶路 ~360）。',
        '- place 只能从【可选地点】里挑。',
        '- beats 3 到 5 条，按发生顺序；who 只能用【在场】或【上一幕在场】里的人名。',
        '- 「上一幕在场」是上一轮谁在、什么状态；人没退场就别换人，伤/病要延续。',
        '- 人物卡里「忌:」是不能碰的底线，beats 不许让人物违背它。',
        '- 「能:」是职权；没这项权的人不能办这件事（文官不能调兵，仆役不能问案）。',
        '- 不要替主角做决定；主角的动作留给他自己。',
        '- 不要编新角色、新地名、没给过的设定。',
        '- hook 要可观察：一个动作、一个停顿、一件不合常理的东西。',
    ].join('\n');

    const castLines = cast.length
        ? cast.map(c => {
            const bits = [c.name];
            if (c.rank) bits.push(c.rank);
            if (c.bondCn) bits.push(c.bondCn);
            if (typeof c.aff === 'number') bits.push(c.band ? `${c.aff}·${c.band}` : String(c.aff));
            let head = `  · ${bits.join('｜')}`;
            if (c.note) head += `  状态:${c.note}`;
            const tail = [];
            if (c.forbids?.length) tail.push(`忌:${c.forbids.join('；')}`);
            if (c.goal) tail.push(`要:${c.goal}`);
            if (c.rights?.length) tail.push(`能:${c.rights.join('/')}`);
            return head + (tail.length ? `\n      ${tail.join('  ')}` : '');
        }).join('\n')
        : '（无）';

    const codeLines = codes.length
        ? codes.map(c => `  · ${c.id}｜${c.name}｜违制:${(c.breach ?? []).join('、')}`).join('\n')
        : '（无）';

    const ev = (label, arr) => (arr?.length ? `${label}${arr.join('、')}` : '');

    const blocks = [
        `【现在的时间】${timeText || '（未知）'}`,
        `【现在的地点】${placePath || placeName || '（未知）'}`,
        sceneCn ? `【场景类型】${sceneCn}` : '',
        `【在场】${onstage.join('、') || '（无）'}`,
        `【上一幕在场】${prevLine || '（无）'}`,
        '',
        '【人物卡】',
        castLines,
        '',
        `【可选地点】${places.slice(0, 60).join('、') || '（无）'}`,
        props.length ? `【此地陈设】${props.slice(0, 6).join('、')}` : '',
        '',
        '【本场礼法候选】',
        codeLines,
        '',
        ev('【未结】', events.pending),
        ev('【可触发】', events.canTrigger),
        ev('【已结】', events.done),
        authority.length ? `【职权】${authority.join('；')}` : '',
        player.rank || player.items?.length
            ? `【玩家】位份:${player.rank || '—'}${player.items?.length ? `  随身:${player.items.join('、')}` : ''}`
            : '',
        '',
        world.length
            ? '【相关设定】\n' + world.map(w => `· ${w.comment}\n  ${w.content}`).join('\n')
            : '',
        rounds.length ? '【最近三轮】\n' + rounds.map((r, i) => `第${i + 1}轮:${r}`).join('\n') : '',
        '',
        '【规则给的骨架】',
        ruleOutline || '（无）',
        '',
        '【最近发生】',
        recent || '（无）',
        lastAi ? `【上一轮正文末尾】${lastAi}` : '',
        '',
        '【玩家这一句】',
        userText || '（空）',
    ];

    let text = blocks.filter(x => x !== '').join('\n');
    // 上下文保险：太长就按「最近三轮 → 相关设定 → 最近发生」的顺序砍
    if (text.length > maxChars) {
        text = blocks
            .filter(x => x !== '' && !x.startsWith('【最近三轮】'))
            .join('\n');
    }
    if (text.length > maxChars) {
        text = text.split('\n').reduce((acc, line) => {
            if (acc.length + line.length > maxChars) return acc;
            return acc ? `${acc}\n${line}` : line;
        }, '');
    }

    return [
        { role: 'system', content: sys },
        { role: 'user', content: text },
    ];
}

const MAX_MINUTES = 3 * 1440;

/** 校验并夹取；返回可直接执行的结果 */
export function validateTurnPlan(data, { resolvePlace, knownCodes } = {}) {
    const out = { minutes: 0, place: null, codes: [], beats: [], hook: '', ok: false };
    if (!data || typeof data !== 'object') return out;

    let m = Number(data.minutes);
    if (!Number.isFinite(m) || m < 0) m = 0;
    out.minutes = Math.min(MAX_MINUTES, Math.round(m));

    if (typeof data.place === 'string' && data.place.trim() && resolvePlace) {
        const hit = resolvePlace(data.place.trim());
        if (hit) out.place = { id: hit.id, name: hit.name };
    }

    if (Array.isArray(data.codes)) {
        out.codes = data.codes
            .filter(c => typeof c === 'string')
            .filter(c => !knownCodes || knownCodes.has(c))
            .slice(0, 2);
    }

    if (Array.isArray(data.beats)) {
        out.beats = data.beats
            .slice(0, 5)
            .map(b => ({
                who: String(b?.who ?? '').trim().slice(0, 8),
                do: String(b?.do ?? '').trim().slice(0, 24),
            }))
            .filter(b => b.who && b.do);
    }

    out.hook = typeof data.hook === 'string' ? data.hook.trim().slice(0, 24) : '';
    out.ok = out.beats.length > 0 || out.minutes > 0 || Boolean(out.place);
    return out;
}

/** 把规划渲染进大纲（写作模型看的） */
export function renderTurnPlan(ruleOutline, plan) {
    const head = String(ruleOutline ?? '').trim();
    const lines = [];
    if (plan.minutes > 0) lines.push(`时间推进:${plan.minutes} 分钟`);
    if (plan.place) lines.push(`换场:${plan.place.name}`);
    if (plan.beats.length) {
        const bs = plan.beats.map((b, i) => `  ${i + 1}. ${b.who}：${b.do}`).join('\n');
        lines.push(`编排:\n${bs}`);
    }
    if (plan.hook) lines.push(`留:${plan.hook}`);
    if (!lines.length) return head;
    return head ? `${head}\n${lines.join('\n')}` : `<导演>\n${lines.join('\n')}\n</导演>`;
}
