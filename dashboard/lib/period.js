// 기간·비교 기준 계산 (모든 날짜는 한국 시간 기준 'YYYY-MM-DD' 문자열)
// 데이터는 매일 06:00에 전날까지 수집되므로 '이번 달'·'이번 주'는 어제까지

const DAY = 86400000;
const toDate = (s) => new Date(s + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * DAY));
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m: 0-11

function addMonths(s, n) {
  const d = toDate(s);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const target = new Date(Date.UTC(y, m, 1));
  const day = Math.min(d.getUTCDate(), lastDayOfMonth(target.getUTCFullYear(), target.getUTCMonth()));
  return fmt(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)));
}

export function todayKst() {
  return fmt(new Date(Date.now() + 9 * 3600000));
}

export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY) + 1;

export const PERIODS = [
  { key: 'yesterday', label: '어제' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'lastmonth', label: '지난달' },
  { key: '12w', label: '최근 12주' },
  { key: 'year', label: '최근 1년' },
];

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime());

/**
 * searchParams → { key, from, to, label, cmp, cmpFrom, cmpTo, cmpLabel }
 * cmp: 'prev' (월 단위 기간은 전월 같은 날짜, 그 외는 바로 앞 같은 길이) / 'yoy' (전년 같은 날짜)
 */
export function parsePeriod(sp = {}, defaultKey = 'month') {
  const yesterday = addDays(todayKst(), -1);
  let key = sp.period || defaultKey;
  let from;
  let to = yesterday;
  if (key === 'custom' && isDate(sp.from) && isDate(sp.to) && sp.from <= sp.to) {
    from = sp.from;
    to = sp.to > yesterday ? yesterday : sp.to;
  } else {
    if (key === 'custom') key = defaultKey;
    const y = toDate(yesterday);
    if (key === 'yesterday') from = yesterday;
    else if (key === 'week') from = addDays(yesterday, -((y.getUTCDay() + 6) % 7)); // 월요일
    else if (key === 'lastmonth') {
      const first = fmt(new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth() - 1, 1)));
      from = first;
      to = fmt(new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), 0)));
    } else if (key === '12w') from = addDays(yesterday, -83);
    else if (key === 'year') from = addDays(yesterday, -364);
    else {
      key = 'month';
      from = fmt(new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), 1)));
    }
  }
  const cmp = sp.cmp === 'yoy' ? 'yoy' : 'prev';
  let cmpFrom;
  let cmpTo;
  if (cmp === 'yoy') {
    cmpFrom = addMonths(from, -12);
    cmpTo = addMonths(to, -12);
  } else if (key === 'month' || key === 'lastmonth') {
    cmpFrom = addMonths(from, -1);
    cmpTo = addMonths(to, -1);
  } else {
    const len = daysBetween(from, to);
    cmpTo = addDays(from, -1);
    cmpFrom = addDays(cmpTo, -(len - 1));
  }
  const short = (s) => s.slice(5).replace('-', '.');
  const range = (a, b) => (a === b ? short(a) : `${short(a)}–${short(b)}`);
  return {
    key, from, to, cmp, cmpFrom, cmpTo,
    label: `${from.replace(/-/g, '.')} – ${short(to)}`,
    cmpLabel: cmp === 'yoy' ? `전년 동기 (${cmpFrom.slice(0, 4)}.${range(cmpFrom, cmpTo)}) · 동일 매장` : (key === 'month' || key === 'lastmonth' ? '전월 동기' : '직전 기간') + ` (${range(cmpFrom, cmpTo)})`,
    days: daysBetween(from, to),
  };
}

/** 현재 searchParams를 유지하면서 일부만 바꾼 쿼리 문자열 */
export function withParams(sp, changes) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...changes })) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '?';
}
