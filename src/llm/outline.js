// 副模型编排大纲（可选）：读状态+你的输入+可发事件，输出 3-5 个 beat
export function buildOutlineMessages({ ruleOutline, userText, onstage, placeName, recent }) {
    const sys = [
        '你在为一本中文古代小说做「场务编排」。只输出 JSON，不要解释。',
        '字段：{"beats":[{"who":"谁","do":"做什么（≤18字）"}],"hook":"末了留什么（≤18字）"}',
        '规则：',
        '- beats 3 到 5 条，按发生顺序；who 只能用给出的人名；不在场的不要写。',
        '- 每条 do 是一个具体动作或一句台词的方向，不要写心理活动。',
        '- hook 要可观察：一个动作、一个停顿、一件不合常理的东西。',
        '- 不要替主角做决定；主角的动作留给他自己。',
        '- 只能用下面给出的信息，不要编新角色、新地名。',
    ].join('\n');

    const user = [
        `【地点】${placeName || '（未知）'}`,
        `【在场】${(onstage ?? []).join('、') || '（无）'}`,
        `【规则给的骨架】\n${ruleOutline || '（无）'}`,
        `【最近发生】\n${recent || '（无）'}`,
        `【玩家这一句】\n${userText || '（空）'}`,
    ].join('\n');

    return [
        { role: 'system', content: sys },
        { role: 'user', content: user },
    ];
}

/** 把模型的 beats 渲染成大纲文字（失败就返回空串，调用方回落规则大纲） */
export function renderModelOutline(data, ruleOutline) {
    const beats = Array.isArray(data?.beats) ? data.beats.slice(0, 5) : [];
    const hook = typeof data?.hook === 'string' ? data.hook.trim() : '';
    if (!beats.length) return '';
    const lines = beats
        .map((b, i) => `  ${i + 1}. ${String(b?.who ?? '').slice(0, 8)}：${String(b?.do ?? '').slice(0, 24)}`)
        .filter(x => x.trim().length > 4);
    if (!lines.length) return '';
    const head = ruleOutline ? `${ruleOutline}\n` : '';
    return `${head}编排:\n${lines.join('\n')}${hook ? `\n留:${hook}` : ''}`;
}
