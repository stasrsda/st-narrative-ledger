// 结算提示词：一次读全文，输出多个分类字段
export function buildSettleMessages({ pack, state, onstage, userText, aiText, candidates }) {
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
        '- kind：A小恩 +8／B中恩 +15／C大恩 +30／D关键 +50／E背叛 −40／F无。',
        '- 只要这一轮有实质互动——说了话、办了事、有了身体接触、改变了态度——就给分，不要习惯性填 F。',
        '- 拿不准给 A 还是 B，就选 A；拿不准给不给，就给 A。宁多勿漏。',
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
    ].join('\n');

    return [
        { role: 'system', content: sys },
        { role: 'user', content: user },
    ];
}
