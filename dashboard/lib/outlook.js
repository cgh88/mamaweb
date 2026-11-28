import { addDays } from './period';

/* 외부 인사이트 계산 (순수 함수) — 앞으로 7일 전망, 날씨·공휴일 영향 요약 */

const DOW = '일월화수목금토';
const isWeekend = (isoDow) => isoDow >= 5; // 금·토·일
const isoDowOf = (d) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const dowLabel = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];

export function wxIcon(f) {
  if (!f) return '';
  if (f.pty?.includes('눈')) return '🌨️';
  if (f.pty) return '🌧️';
  return { 맑음: '☀️', 구름많음: '⛅', 흐림: '☁️' }[f.sky] || '🌤️';
}
export const obsIcon = (w) => (!w ? '' : Number(w.snow_cm) > 0 ? '🌨️' : Number(w.rain_mm) >= 1 ? '🌧️' : '');

/** 날씨 영향: 평일/주말별 비 오는 날 ÷ 맑은 날 주문 비율, 기온대별 평균 */
export function weatherSummary(rows) {
  const pairs = {};
  const temps = [];
  for (const r of rows) {
    if (r.daytype && r.wx) (pairs[r.daytype] ||= {})[r.wx] = r;
    else if (r.temp) temps.push(r);
  }
  const ratio = {};
  for (const [k, v] of Object.entries(pairs)) {
    if (v.rain?.days >= 5 && v.dry?.days >= 5) {
      ratio[k] = {
        orders: Number(v.rain.orders) / Number(v.dry.orders),
        delivery: Number(v.dry.delivery) ? Number(v.rain.delivery) / Number(v.dry.delivery) : null,
        rainDays: v.rain.days, dryDays: v.dry.days, rain: v.rain, dry: v.dry,
      };
    }
  }
  const order = ['영하', '0~10℃', '10~20℃', '20~27℃', '27℃ 이상'];
  temps.sort((a, b) => order.indexOf(a.temp) - order.indexOf(b.temp));
  return { ratio, temps, has: rows.length > 0 };
}

/** 공휴일 영향: 평소 같은 요일 대비 비율 (중앙값) */
export function holidaySummary(rows) {
  const ratios = rows.filter((r) => Number(r.base_orders) > 0).map((r) => Number(r.orders) / Number(r.base_orders)).sort((a, b) => a - b);
  const median = ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : null;
  return { median, count: ratios.length };
}

/**
 * 앞으로 n일 전망
 *  base: 같은 요일 최근 4주 평균 주문(공휴일 제외) → 공휴일·비 예보 보정
 */
export function buildOutlook({ today, days = 7, store, base, holidays, events, forecast, wx, hol }) {
  const byDow = Object.fromEntries(base.byDow.map((r) => [r.dow, r]));
  const holMap = Object.fromEntries(holidays.map((h) => [h.day, h.name]));
  const region = store && store !== 'all' ? store : '독립문점';
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i);
    const iso = isoDowOf(d);
    const daytype = isWeekend(iso) ? '주말(금·토·일)' : '평일(월~목)';
    const fcs = forecast.filter((f) => f.day === d);
    const fc = fcs.find((f) => f.region === region) || fcs[0] || null;
    const rainy = !!fc && (!!fc.pty || Number(fc.pop) >= 60);
    const b = byDow[iso];
    const notes = [];
    let factor = 1;
    if (holMap[d] && hol.median) { factor *= hol.median; notes.push(`공휴일 ×${hol.median.toFixed(2)}`); }
    const rf = wx.ratio[daytype];
    if (rainy && rf) { factor *= rf.orders; notes.push(`비 예보 ×${rf.orders.toFixed(2)}`); }
    const expected = b ? Number(b.orders) * factor : null;
    return {
      d, dow: dowLabel(d), weekend: iso >= 6, holiday: holMap[d] || null,
      events: events.filter((e) => e.date_from <= d && e.date_to >= d),
      fc, fcs, rainy, expected, baseOrders: b ? Number(b.orders) : null, notes,
      chicken: expected && base.chickenPerOrder ? expected * base.chickenPerOrder : null,
    };
  });
}
