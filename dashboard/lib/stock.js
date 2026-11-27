// 재고 상태 판정 (서버·클라이언트 공용, 순수 함수)
//   추정 재고 = 마지막 실사 수량 + 실사 이후 입고 - 실사 다음 날부터 어제까지 판매로 쓴 양(레시피 기준)
//   부족: 추정 재고 ≤ 안전재고 / 주의: 안전재고까지 2일치 사용량 이하 남음

export const WARN_DAYS = 2;
export const AVG_DAYS = 28;

export function evaluate(r) {
  if (r.count_date === null || r.count_date === undefined) {
    return { ...r, est: null, daysLeft: null, status: 'nocount', label: '실사 필요' };
  }
  const est = Number(r.count_qty) + Number(r.received || 0) - Number(r.used_since || 0);
  const avg = Number(r.avg_daily || 0);
  const daysLeft = avg > 0 ? Math.max(0, est) / avg : null;
  let status = 'ok';
  let label = '정상';
  if (r.safety_qty === null || r.safety_qty === undefined) {
    status = 'nosafety';
    label = '안전재고 미설정';
  } else if (est <= Number(r.safety_qty)) {
    status = 'low';
    label = '부족';
  } else if (avg > 0 && (est - Number(r.safety_qty)) / avg <= WARN_DAYS) {
    status = 'warn';
    label = '주의';
  }
  return { ...r, est, daysLeft, status, label };
}

/** 수량 표시: 소수 1자리까지 */
const round1 = (n) => (Math.round(Number(n) * 10) / 10) || 0; // -0 방지
export const qtyFmt = (n) => (n === null || n === undefined ? '-' : round1(n).toLocaleString('ko-KR'));

/** 발주 단위 환산 (예: 12,000 g → 1.2박스) */
export const packFmt = (n, ing) => (ing.pack_size && n !== null && n !== undefined ? `${round1(Number(n) / ing.pack_size).toLocaleString('ko-KR')}${ing.pack_name || '팩'}` : '');
