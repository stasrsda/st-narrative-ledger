// 表注入：代码有数据、但不必每轮都上的东西，按需给一行
const PRICE_HINT = /银|钱|两|文|买|卖|价|贵|贱|赏|月例|份例|俸|雇|粮|炭|药|马|轿|宅|婢/;
const COLOR_HINT = /穿|衣|服|色|袍|襦|裙|披|氅|簪|冠|佩/;
const TRAVEL_HINT = /路|程|几日|几天|多久|多远|驿|出发|启程|动身|赶/;

export function wantsPrices(text = '') {
    return PRICE_HINT.test(String(text));
}
export function wantsColors(text = '') {
    return COLOR_HINT.test(String(text));
}
export function wantsTravel(text = '') {
    return TRAVEL_HINT.test(String(text));
}

/** 当期物价系数：默认「常年」 */
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
    if (wantsPrices(text)) {
        out.push({ key: 'price', text: priceLine(pack) });
        out.push({ key: 'stipend', text: stipendLine(pack, { ranks: ['正妃', '侧妃', '妾', '通房'] }) });
    }
    if (wantsColors(text)) out.push({ key: 'color', text: colorLine(pack) });
    if (wantsTravel(text)) out.push({ key: 'travel', text: travelLine(pack) });
    return out.filter(x => x.text);
}
