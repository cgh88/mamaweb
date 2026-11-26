export const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
export const num = won;
export const man = (n) => Math.round((Number(n) || 0) / 10000).toLocaleString('ko-KR');

/** 큰 금액을 '7억 1,278만원'처럼 */
export function eok(n) {
  const v = Math.round((Number(n) || 0) / 10000);
  const e = Math.floor(v / 10000);
  const m = v % 10000;
  return e ? `${e}억${m ? ` ${m.toLocaleString('ko-KR')}만` : ''}원` : `${m.toLocaleString('ko-KR')}만원`;
}

export const pct = (part, total, digits = 1) => (total ? ((part / total) * 100).toFixed(digits) : '0.0');

/** 증감: { text: '▲ 3.8%', cls: 'up' } */
export function delta(cur, base) {
  if (!base) return { text: '—', cls: 'muted' };
  const v = (cur / base - 1) * 100;
  return { text: `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%`, cls: v >= 0 ? 'up' : 'down' };
}

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
