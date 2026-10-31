// 表注入：代码有数据、但不必每轮都上的东西，按需给一行
// 只有真的在谈钱/价，才挂物价表（以前「两」「马」「宅」就命中，几乎每轮都上）
const PRICE_HINT = /多少钱|几两|几文|几钱|什么价|价钱|物价|市价|米价|粮价|开价|出价|花了钱|付钱|银子|银两|买下|卖掉|月钱|月例|份例|俸禄|赏钱|赏银|账上|账面|赎/

// 只有谈到位份/婚嫁/月钱，才挂份例表
const STIPEND_HINT = /月钱|月例|份例|俸禄|位份|正妃|侧妃|妾室|通房|侍妾|嫁妆|聘礼|册封|赏赐|用度/

// 只有真的在移动，才挂路程表（以前「路」「程」这种单字太容易命中）
const TRAVEL_HINT = /(?<![回上下一进过起想说到看听感做受找等记得算轮])[去到往赴](?!底|期)|启程|出发|动身|赶路|上路|路程|几日|几天|多远|多久/

const COLOR_HINT = /穿|衣|服|色|袍|襦|裙|披|氅|簪|冠|佩/

export function wantsPrices(text = '') {
    return PRICE_HINT.test(String(text));
}
export function wantsStipend(text = '') {
    return STIPEND_HINT.test(String(text));
}
export function wantsColors(text = '') {
    return COLOR_HINT.test(String(text));
}
export function wantsTravel(text = '') {
    return TRAVEL_HINT.test(String(text));
}

export function priceIndex(pack, name = '常年') {
    const idx = pack?.tables?.prices?.index ?? {};
    return idx[name] ?? 1;
}

/**
 * [价] 米一石 1200｜肉 20｜炭 5｜药 30（文·常年）
 */
export function priceLine(pack, { index = '常年', items = null, max = 5 } = {}) {
    const t = pack?.tables?.prices;
    if (!t?.base) return '';
    const k = priceIndex(pack, index);
    const keys = items ?? Object.keys(t.base).slice(0, max);
    const body = keys.map(name => {
        const v = t.base[name];
        if (!Number.isFinite(v)) return '';
        const scaled = k === 1 ? v : Math.round(v * k);
        return `${name} ${scaled}`;
    }).filter(Boolean).join('｜');
    if (!body) return '';
    return `[价] ${body}（${t.unit ?? '文'}·${index}${k === 1 ? '' : ` ×${k}`}）`;
}

/** [色] 明黄=帝后｜紫=三品以上｜素=未嫁女子 */
export function colorLine(pack, { max = 6 } = {}) {
    const items = pack?.tables?.colors?.items ?? {};
    const keys = Object.keys(items).slice(0, max);
    if (!keys.length) return '';
    return `[色] ${keys.map(k => `${k}=${items[k]}`).join('｜')}（逾色即僭）`;
}

/** [例] 正妃 20000｜侧妃 15000｜妾 8000（文/月）；府库紧张 ×0.5 */
export function stipendLine(pack, { ranks = null } = {}) {
    const t = pack?.tables?.stipend;
    if (!t?.base) return '';
    const keys = ranks ?? Object.keys(t.base);
    const body = keys.filter(k => Number.isFinite(t.base[k])).map(k => `${k} ${t.base[k]}`).join('｜');
    if (!body) return '';
    const mods = (t.modifiers ?? []).slice(0, 2).join('；');
    return `[例] ${body}（${t.unit ?? '文/月'}）${mods ? '；' + mods : ''}`;
}

/** [程] 北凉城→京城 14 天｜雁回县→京城 12 天 */
export function travelLine(pack, { max = 3 } = {}) {
    const items = pack?.tables?.travel?.items ?? {};
    const keys = Object.keys(items).slice(0, max);
    if (!keys.length) return '';
    return `[程] ${keys.map(k => `${k} ${items[k]}`).join('｜')}`;
}

/**
 * 按当轮文本决定要挂哪几行
 * @returns {Array<{key:string,text:string}>}
 */
export function tableLines(pack, text = '') {
    const out = [];
    if (wantsPrices(text)) out.push({ key: 'price', text: priceLine(pack) });
    if (wantsStipend(text)) {
        out.push({ key: 'stipend', text: stipendLine(pack, { ranks: ['正妃', '侧妃', '妾', '通房'] }) });
    }
    if (wantsColors(text)) out.push({ key: 'color', text: colorLine(pack) });
    if (wantsTravel(text)) out.push({ key: 'travel', text: travelLine(pack) });
    return out.filter(x => x.text);
}
