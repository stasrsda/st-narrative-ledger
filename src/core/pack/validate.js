// 世界包校验：只报错，不改数据
import { SCENES } from '../place/tree.js';

const ACCESS = new Set(['free', 'discreet', 'taboo']);
const MODES = new Set(['hint', 'beat']);
const AXES = ['respect', 'fear', 'closeness', 'contempt'];

export function validatePack(pack) {
    const errors = [];
    const err = (path, code, msg) => errors.push({ path, code, msg });

    if (!pack || typeof pack !== 'object') {
        err('', 'not_object', '世界包必须是对象');
        return { ok: false, errors };
    }
    if (pack.schemaVersion !== 1) err('schemaVersion', 'version', `不支持的版本 ${pack.schemaVersion}`);
    if (!pack.id) err('id', 'required', '缺 id');
    if (!pack.name) err('name', 'required', '缺 name');

    // ── calendar ──
    const cal = pack.calendar ?? {};
    if (!(Number.isInteger(cal.monthDays) && cal.monthDays > 0 && cal.monthDays <= 31)) {
        err('calendar.monthDays', 'range', 'monthDays 需 1–31 整数');
    }
    if (typeof cal.era !== 'string' || !cal.era) err('calendar.era', 'required', '缺 era');

    // ── climate ──
    const vocab = new Set(pack.climate?.vocabulary ?? []);
    if (!vocab.size) err('climate.vocabulary', 'required', '天气词表为空');
    const zones = pack.climate?.zones ?? [];
    if (!zones.length) err('climate.zones', 'required', '没有气候带');
    const zoneIds = new Set();
    for (const z of zones) {
        if (!z.id) err('climate.zones[].id', 'required', '气候带缺 id');
        if (zoneIds.has(z.id)) err(`climate.zones.${z.id}`, 'dup', '气候带 id 重复');
        zoneIds.add(z.id);
        for (const s of ['spring', 'summer', 'autumn', 'winter']) {
            const list = z.seasons?.[s];
            if (!Array.isArray(list) || !list.length) {
                err(`climate.zones.${z.id}.${s}`, 'required', '季节候选为空');
                continue;
            }
            for (const w of list) {
                if (!vocab.has(w)) err(`climate.zones.${z.id}.${s}`, 'vocab', `天气「${w}」不在词表`);
            }
        }
    }

    // ── festivals ──
    for (const f of pack.festivals ?? []) {
        if (!(f.month >= 1 && f.month <= 12)) err('festivals', 'range', `节令月份越界：${f.name}`);
        if (!(f.day >= 1 && f.day <= cal.monthDays)) err('festivals', 'range', `节令日期越界：${f.name}`);
        if (!f.name) err('festivals', 'required', '节令缺 name');
    }

    // ── affinity ──
    const aff = pack.affinity ?? {};
    if (!(aff.min < aff.max)) err('affinity', 'range', 'min 必须小于 max');
    const step = aff.step ?? 10;
    const need = Math.floor((aff.max - aff.min) / step) + 1;
    if ((aff.ladder ?? []).length !== need) {
        err('affinity.ladder', 'count', `档位应为 ${need}，实际 ${(aff.ladder ?? []).length}`);
    }

    // ── ranks ──
    const ranks = pack.ranks ?? {};
    const rankIds = new Set(Object.keys(ranks));
    for (const [k, r] of Object.entries(ranks)) {
        if (!ACCESS.has(r.access)) err(`ranks.${k}.access`, 'enum', `access 非法：${r.access}`);
        if (typeof r.overnight !== 'boolean') err(`ranks.${k}.overnight`, 'type', 'overnight 应为布尔');
        if (!Number.isFinite(r.order)) err(`ranks.${k}.order`, 'type', 'order 应为数字');
    }

    // ── motives ──
    const motives = pack.motives ?? [];
    if (!motives.length) err('motives', 'required', '没有动机表');
    const hasMin = motives.every(m => Number.isFinite(m.min));
    if (hasMin) {
        for (let i = 1; i < motives.length; i++) {
            if (!(motives[i].min > motives[i - 1].min)) err('motives', 'order', '动机 min 未升序');
        }
    }

    // ── codes ──
    const codeIds = new Set();
    for (const kind of ['rites', 'house', 'laws']) {
        for (const c of pack.codes?.[kind] ?? []) {
            if (codeIds.has(c.id)) err(`codes.${kind}.${c.id}`, 'dup', '规则 id 重复');
            codeIds.add(c.id);
            for (const f of ['name', 'brief', 'detail', 'penalty']) {
                if (!c[f]) err(`codes.${kind}.${c.id}.${f}`, 'required', '字段缺失');
            }
            if (!Array.isArray(c.breach) || !c.breach.length) err(`codes.${kind}.${c.id}.breach`, 'required', 'breach 需非空数组');
            if (!c.react || typeof c.react !== 'object') err(`codes.${kind}.${c.id}.react`, 'required', 'react 缺失');
            if (kind === 'laws' && !c.severity) err(`codes.laws.${c.id}.severity`, 'required', '法条缺 severity');
        }
    }

    // ── places ──
    const placeIds = new Set();
    for (const pl of pack.places ?? []) {
        if (placeIds.has(pl.id)) err(`places.${pl.id}`, 'dup', '地点 id 重复');
        placeIds.add(pl.id);
        if (!SCENES.includes(pl.scene)) err(`places.${pl.id}.scene`, 'enum', `scene 非法：${pl.scene}`);
        if (pl.climate && !zoneIds.has(pl.climate)) err(`places.${pl.id}.climate`, 'ref', '气候带不存在');
    }
    for (const pl of pack.places ?? []) {
        if (pl.parent && !placeIds.has(pl.parent)) err(`places.${pl.id}.parent`, 'ref', '父节点不存在');
    }

    // ── actors ──
    const actorIds = new Set();
    const stanceIds = new Set((pack.gaze?.stances ?? []).map(s => s.id));
    const temperIds = new Set((pack.gaze?.temper ?? []).map(s => s.id));
    const knowIds = new Set((pack.gaze?.knowledge ?? []).map(s => s.id));
    for (const a of pack.actors ?? []) {
        if (actorIds.has(a.id)) err(`actors.${a.id}`, 'dup', '角色 id 重复');
        actorIds.add(a.id);
        if (!rankIds.has(a.rank)) err(`actors.${a.id}.rank`, 'ref', `位份不存在：${a.rank}`);
        if (a.aff < aff.min || a.aff > aff.max) err(`actors.${a.id}.aff`, 'range', '好感越界');
        if (a.stance && !stanceIds.has(a.stance)) err(`actors.${a.id}.stance`, 'ref', '立场不存在');
        if (a.temper && !temperIds.has(a.temper)) err(`actors.${a.id}.temper`, 'ref', '性情不存在');
        for (const k of a.knows ?? []) {
            if (!knowIds.has(k)) err(`actors.${a.id}.knows`, 'ref', `所知不存在：${k}`);
        }
        for (const l of a.lines ?? []) {
            if (!l.from) err(`actors.${a.id}.lines.${l.id}`, 'required', '底线缺出处 from');
        }
        for (const b of a.beats ?? []) {
            if (!MODES.has(b.mode)) err(`actors.${a.id}.beats.${b.id}.mode`, 'enum', 'mode 非法');
        }
    }

    // ── events ──
    const evIds = new Set();
    for (const e of pack.events ?? []) {
        if (evIds.has(e.id)) err(`events.${e.id}`, 'dup', '事件 id 重复');
        evIds.add(e.id);
    }
    for (const e of pack.events ?? []) {
        for (const r of [...(e.requires ?? []), ...(e.after ?? [])]) {
            if (r === e.id) err(`events.${e.id}`, 'self', '自依赖');
            else if (!evIds.has(r)) err(`events.${e.id}`, 'ref', `引用不存在的事件：${r}`);
        }
    }

    // ── tables ──
    const t = pack.tables ?? {};
    for (const [k, v] of Object.entries(t.prices?.base ?? {})) {
        if (!Number.isFinite(v)) err(`tables.prices.base.${k}`, 'type', '价格应为数字');
    }
    for (const [k, v] of Object.entries(t.prices?.index ?? {})) {
        if (!Number.isFinite(v)) err(`tables.prices.index.${k}`, 'type', '系数应为数字');
    }

    // ── customs ──
    const months = (pack.customs ?? []).map(c => c.month);
    if (months.length && new Set(months).size !== months.length) err('customs', 'dup', '月份重复');
    for (const c of pack.customs ?? []) {
        for (const d of c.days ?? []) {
            if (!(d.day >= 1 && d.day <= cal.monthDays)) err(`customs.${c.month}`, 'range', '日期越界');
        }
    }

    // ── props ──
    for (const k of Object.keys(pack.props?.by_scene ?? {})) {
        if (!SCENES.includes(k)) err(`props.by_scene.${k}`, 'enum', `场景非法：${k}`);
    }

    // ── gaze ──
    for (const s of pack.gaze?.stances ?? []) {
        for (const ax of AXES) {
            if (!Number.isFinite(s.base?.[ax])) err(`gaze.${s.id}.base.${ax}`, 'type', '轴应为数字');
        }
    }

    return { ok: errors.length === 0, errors };
}
