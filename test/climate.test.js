import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seasonOf, zoneOf, calOf } from '../src/core/climate/season.js';
import { candidates, pick, weatherFor, renderWeather } from '../src/core/climate/weather.js';
import { festivalOn, nextFestival, renderFestival, sceneLine } from '../src/core/climate/festival.js';
import { fromParts, fromDate, toDate } from '../src/core/calendar/guofeng.js';

const pack = JSON.parse(readFileSync(new URL('../packs/beiliang.worldpack.json', import.meta.url), 'utf8'));
const zone = id => pack.climate.zones.find(z => z.id === id);
const at = (month, day, shichen = 6, ke = 1) => fromParts({ year: 27, month, day, shichen, ke });

test('季节：默认映射 + 地区覆写', () => {
    assert.equal(seasonOf(4), 'spring');
    assert.equal(seasonOf(7), 'summer');
    assert.equal(seasonOf(9), 'autumn');
    assert.equal(seasonOf(1), 'winter');
    // 塞北：三月与十月都并进冬天
    assert.equal(seasonOf(3, zone('saibei')), 'winter');
    assert.equal(seasonOf(10, zone('saibei')), 'winter');
    // 中原不覆写
    assert.equal(seasonOf(10, zone('zhongyuan')), 'autumn');
});

test('气候带定位：优先节点 climate，其次名字', () => {
    assert.equal(zoneOf(pack, { climate: 'caoyuan', name: '某地' }).id, 'caoyuan');
    assert.equal(zoneOf(pack, { name: '雁回县' }).id, 'saibei');
    assert.equal(zoneOf(pack, null).id, pack.climate.zones[0].id);
});

test('候选集：只在词表内', () => {
    const vocab = new Set(pack.climate.vocabulary);
    for (const z of pack.climate.zones) {
        for (const s of ['spring', 'summer', 'autumn', 'winter']) {
            for (const w of candidates(z, s)) {
                assert.ok(vocab.has(w), `${z.id}/${s} 的 ${w} 不在词表`);
            }
        }
    }
});

test('北方冬天会下雪，江南冬天不下', () => {
    assert.ok(candidates(zone('saibei'), 'winter').includes('雪'));
    assert.ok(!candidates(zone('jiangnan'), 'winter').includes('雪'));
});

test('pick：同种子同名，结果必在候选内', () => {
    const list = ['晴', '阴', '雪'];
    assert.equal(pick(list, 'abc'), pick(list, 'abc'));
    assert.ok(list.includes(pick(list, 'xyz')));
    assert.equal(pick([], 'abc'), null);
});

test('天气：同一时刻稳定，不同日不同种子', () => {
    const place = { name: '雁回县', climate: 'saibei' };
    const a = weatherFor({ pack, placeNode: place, t: at(12, 5), chatSeed: 'c1' });
    const b = weatherFor({ pack, placeNode: place, t: at(12, 5), chatSeed: 'c1' });
    assert.equal(a.word, b.word);
    assert.equal(a.season, 'winter');

    const c = weatherFor({ pack, placeNode: place, t: at(12, 6), chatSeed: 'c1' });
    assert.notEqual(a.stableSeed, c.stableSeed);

    const d = weatherFor({ pack, placeNode: place, t: at(12, 5), chatSeed: 'c2' });
    assert.notEqual(a.stableSeed, d.stableSeed);
});

test('天气渲染', () => {
    const w = { word: '小雪', season: 'winter' };
    assert.equal(renderWeather(w), '小雪 · 冬');
    assert.equal(renderWeather(w, '北风'), '小雪·北风 · 冬');
    assert.equal(renderWeather(null), '');
});

test('节令：当天命中', () => {
    const f = festivalOn(pack, at(12, 8));
    assert.ok(f);
    assert.equal(f.name, '腊八');
    assert.equal(festivalOn(pack, at(12, 9)), null);
});

test('节令：最近一个与措辞', () => {
    const t = at(12, 7);
    const n = nextFestival(pack, t, 30);
    assert.equal(n.name, '腊八');
    assert.equal(n.days, 1);
    assert.equal(renderFestival(n), '腊八（明日）');

    const today = nextFestival(pack, at(12, 8), 30);
    assert.equal(renderFestival(today), '腊八（今日）');
});

test('节令：跨年也能找到（腊八 → 小年 → 元日）', () => {
    const n1 = nextFestival(pack, at(12, 20), 40);
    assert.equal(n1.name, '小年');
    assert.equal(n1.days, 3);

    const n2 = nextFestival(pack, at(12, 28), 40);
    assert.equal(n2.name, '元日');
    assert.equal(n2.days, 3);
});

test('一行组合', () => {
    const line = sceneLine({ weather: '小雪 · 冬', festival: '腊八（明日）' });
    assert.equal(line, '天:小雪 · 冬 | 节:腊八（明日）');
    assert.equal(sceneLine({}), '');
});

test('日历参数来自世界包', () => {
    const cal = calOf(pack);
    assert.equal(cal.monthDays, 30);
    assert.deepEqual(toDate(fromDate({ year: 3, month: 5, day: 7 }, cal), cal), { year: 3, month: 5, day: 7 });
});
