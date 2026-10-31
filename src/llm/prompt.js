// 结算提示词：一次读全文，输出多个分类字段
export function buildSettleMessages({ pack, state, onstage, userText, aiText, aiThinking, candidates }) {
    const ev = pack?.affinity?.events ?? { A: 1, B: 2, C: 5, D: 10, E: -15, F: 0 };
    const kindLine = [
        `A日常 +${ev.A}`, `B有来有回 +${ev.B}`, `C关键场面 +${ev.C}`,
        `D重大转折 +${ev.D}`, `E背叛 ${ev.E}`, 'F无变化 0',
    ].join('／');

    const sys = [
        '你在为一个角色扮演游戏做记账。只输出一个 JSON 对象，不要解释。',
        '',
        '字段：',
        '{"results":[{"actor":"名字","kind":"A|B|C|D|E|F","note":"≤20字","quote":"原文片段"}],',
        ' "beats":[{"actor":"名字","id":"节拍id"}],',
        ' "codeHits":[{"id":"规则id","kind":"rite|house|law"}],',
        ' "happened":[{"name":"≤20字","quote":"原文片段"}],',
        ' "knows":[{"actor":"名字","fact":"短语"}]}',
        '',
        '规则：',
        `- kind：${kindLine}。`,
        '- 档位是「这一轮发生的事有多重」，不是「你有多努力」。日常一问一答就是 A。',
        '- 同一轮里，一件事只记一次；不要因为写了三段话就叠三次。',
        '- 拿不准给 A 还是 B，选 A；拿不准给不给，给 A。',
        '- 只记在场角色；不在场的不要写。',
        '- happened 每轮最多一条，只记「有后果」的事（改变关系、位置、知情、名声）。',
        '- codeHits 只能从下面给出的候选里选，不能自己编。',
        '- quote 必须是正文里真实出现过的一段话；找不到就不填。',
    ].join('\n');

    const people = (onstage ?? [])
        .map(a => `${a.name}（好感 ${a.aff}，位份 ${a.rank ?? '—'}）`)
        .join('；') || '（无）';

    const codes = (candidates ?? [])
        .map(c => `${c.id}=${c.name}：${c.brief ?? ''}`)
        .join('\n') || '（无）';

    const user = [
        `【在场】${people}`,
        `【候选礼法】\n${codes}`,
        '',
        '【玩家输入】',
        userText || '（空）',
        '',
        '【本轮正文】',
        aiText || '（空）',
    ,
        (aiThinking ? `【这一轮的思考（只作参考，不要当正文）】\n${String(aiThinking).slice(-800)}` : ''),
    ].join('\n');

    return [
        { role: 'system', content: sys },
        { role: 'user', content: user },
    ];
}
