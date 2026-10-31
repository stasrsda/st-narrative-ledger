// 导演层：把规则算出来的东西压成一份「本场大纲」交给写作模型扩写
import { retrieveCodes } from '../codes/retrieve.js';
import { pendingEvents } from '../runtime/scene.js';

const RHYTHM = {
    court: '先给堂上规矩，再让一方开口，末了留一个未答的问题',
    prison: '先写环境（潮、暗、声），再写被问的人怎么答，末了留一句没说完的',
    inner_court: '先写在场次序，再写一件小事，末了有人退半步',
    bedroom: '先写光与温度，再写一个动作，末了留一段沉默',
    camp: '先写甲械声，再写下令，末了留一个没领命的人',
    street: '先写人流与气味，再写一个不合常理的东西',
    gate: '先写门禁与盘查，再写一个卡住的人',
    hall: '先写座次，再写一句试探，末了留一个不接话的人',
    market: '先写价与秤，再写一笔算不清的账',
};

/**
 * @returns {{text:string, tokens:number, parts:object}}
 */
export function buildOutline(pack, state, meta, userText, tree) {
    const scene = state.place ? tree?.nodes?.[state.place]?.scene : null;
    const node = state.place ? tree?.nodes?.[state.place] : null;
    const onstage = (meta?.onstage ?? []).map(id => pack.index?.actor?.[id]).filter(Boolean);

    const lines = [];

    // ① 这一场在哪、什么时候
    const place = node?.name ?? meta?.placeName ?? '';
    if (place) lines.push(`场:${place}${scene ? `（${scene}）` : ''}`);

    // ② 谁在，各自什么态度、不能碰什么
    if (onstage.length) {
        const who = onstage.slice(0, 4).map(a => {
            const aff = state.aff?.[a.id] ?? a.aff ?? 0;
            const forbid = a.lines?.[0]?.text;
            const short = forbid ? forbid.split(/[；。、，]/)[0].slice(0, 18) : '';
            return short ? `${a.name}（忌:${short}）` : a.name;
        });
        lines.push(`人:${who.join('、')}`);
    }

    // ③ 本场可能触发的礼法（只取三条）
    const codes = retrieveCodes(pack, {
        scene, rankIds: onstage.map(a => a.rank).filter(Boolean), text: userText ?? '', state,
    }, 3);
    if (codes.length) {
        lines.push(`礼:${codes.map(c => `${c.name}（忌:${(c.breach ?? []).slice(0, 2).join('、')}）`).join('；')}`);
    }

    // ④ 能发生的事
    const pend = pendingEvents(pack, state, 3);
    if (pend.length) {
        const names = pend.map(e => (typeof e === 'string' ? e : (e?.name ?? e?.id ?? ''))).filter(Boolean);
        if (names.length) lines.push(`可发:${names.join('、')}`);
    }

    // ⑤ 节奏建议
    const beat = RHYTHM[scene] ?? '先给具体的物与动作，再给一句对白，末了停在未完成处';
    lines.push(`节奏:${beat}`);

    // ⑥ 用户这一句的落点
    const u = String(userText ?? '').trim();
    if (u) lines.push(`接:${u.slice(0, 40)}`);

    const text = `<导演>\n${lines.join('\n')}\n只按这份大纲写，不要另起情节；大纲没提到的人不要凭空安排进来。\n</导演>`;
    return { text, tokens: Math.ceil(text.length / 1.4), parts: { place, onstage: onstage.length, codes: codes.length } };
}
