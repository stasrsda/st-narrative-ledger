// 观感：立场打底 + 所知修正 + 性情定表现
const AXES = ['respect', 'fear', 'closeness', 'contempt'];

export function stanceOf(pack, id) {
    return (pack.gaze?.stances ?? []).find(s => s.id === id) ?? null;
}
export function temperOf(pack, id) {
    return (pack.gaze?.temper ?? []).find(t => t.id === id) ?? null;
}
export function knowledgeOf(pack, ids = []) {
    const all = pack.gaze?.knowledge ?? [];
    return ids.map(id => all.find(k => k.id === id)).filter(Boolean);
}

/** 四轴合成 */
export function gazeOf(pack, actor) {
    const base = stanceOf(pack, actor?.stance)?.base ?? zero();
    const out = { ...base };
    for (const k of knowledgeOf(pack, actor?.knows ?? [])) {
        for (const ax of AXES) {
            out[ax] = (out[ax] ?? 0) + (k.mod?.[ax] ?? 0);
        }
    }
    return out;
}

function zero() {
    return { respect: 0, fear: 0, closeness: 0, contempt: 0 };
}

/** 由四轴出发，取姿态；性情只调一档 */
export function postureOf(pack, actor) {
    const g = gazeOf(pack, actor);
    const stance = stanceOf(pack, actor?.stance);
    const temper = temperOf(pack, actor?.temper);
    const shift = temper?.shift ?? 0;

    let posture = stance?.posture ?? '按礼行礼';
    let eye = stance?.eye ?? '不看人';

    if (g.fear >= 2 && g.respect < 1) {
        posture = '跪，或退到墙边';
        eye = '低头，不敢抬';
    } else if (g.respect >= 2) {
        posture = stance?.posture ?? '抱拳躬身';
        eye = '敢直视';
    } else if (g.contempt >= 2) {
        posture = '礼数周全，一步不差';
        eye = '笑着看';
    }
    if (shift > 0 && !posture.startsWith('跪')) posture = '多跪一级：' + posture;
    if (shift < 0 && posture.startsWith('跪')) posture = '跪得慢半拍，起得早';

    return { posture, eye, axes: g, address: stance?.address ?? '' };
}

/** 京城朝臣·滑头｜畏2敬0轻1｜揖不跪｜避目光 */
export function gazeLine(pack, actor) {
    const stance = stanceOf(pack, actor?.stance);
    const temper = temperOf(pack, actor?.temper);
    const p = postureOf(pack, actor);
    const axes = AXES.map(a => `${'敬畏近轻'[AXES.indexOf(a)]}${p.axes[a]}`).join('');
    return [stance?.label ?? '未知立场', temper?.label ?? '', axes, p.posture, p.eye]
        .filter(Boolean).join('｜');
}

/** 群众：按立场分组，每组一句 */
export function crowdLine(pack, actors = []) {
    const groups = new Map();
    for (const a of actors) {
        const label = stanceOf(pack, a?.stance)?.label ?? '旁人';
        groups.set(label, (groups.get(label) ?? 0) + 1);
    }
    return [...groups.entries()].map(([k, n]) => `${k}${n}人`).join('、');
}
