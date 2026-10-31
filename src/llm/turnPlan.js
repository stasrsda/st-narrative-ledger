// 一轮的总规划：时间跳转 + 地点 + 本场礼法 + 分镜
// 由副模型一次产出，插件负责校验（算错的数字、不认识的地名一律丢掉）
export function buildTurnMessages({ userText, placeName, onstage, prevLine, places, ruleOutline, recent, timeText }) {
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
        '- minutes 只能填分钟数。跨日写 1440，一个时辰 120，一刻 15，半个时辰 60。',
        '- 玩家说了「次日/第二天」就必须 ≥1440；说了「一刻/马上」就 ≤30；没提时间就给场景自然耗时（问话 ~30、抄家 ~60、赶路 ~360）。',
        '- place 只能从下面列出的地点里挑；名单外的别填。',
        '- beats 3 到 5 条，按发生顺序；who 只能用给出的在场人名；不在场的不要写。',
        '- 不要替主角做决定；主角的动作留给他自己。',
        '- 只能用给出的信息，不要编新角色。',
        '- 「上一幕在场」是上一轮谁在、什么状态；这一轮接着它走：人没退场就别换人，状态（伤、病）要延续。',
    ].join('\n');

    const user = [
        `【现在的时间】${timeText || '（未知）'}`,
        `【现在的地点】${placeName || '（未知）'}`,
        `【在场】${(onstage ?? []).join('、') || '（无）'}`,
        `【上一幕在场】${prevLine || '（无）'}`,
        `【可选地点】${(places ?? []).slice(0, 60).join('、')}`,
        `【规则给的骨架】\n${ruleOutline || '（无）'}`,
        `【最近发生】\n${recent || '（无）'}`,
        `【玩家这一句】\n${userText || '（空）'}`,
    ].join('\n');

    return [
        { role: 'system', content: sys },
        { role: 'user', content: user },
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
    // 把「节奏/接」这些规则行留下，其它（礼/可发）保留，末尾接编排
    return head ? `${head}\n${lines.join('\n')}` : `<导演>\n${lines.join('\n')}\n</导演>`;
}
