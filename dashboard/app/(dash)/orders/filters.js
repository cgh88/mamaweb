// 주문 리포트 필터 (페이지와 CSV 내려받기 공용) — 허용된 값만 통과
export const TYPE_OPTIONS = [['', '전체'], ['배달', '배달'], ['포장', '포장'], ['매장', '매장(홀)']];
export const CHANNEL_OPTIONS = [['', '전체'], ['배달의민족', '배달의민족'], ['쿠팡이츠', '쿠팡이츠'], ['요기요', '요기요'], ['배달앱(BDP)', '배달앱(BDP)'], ['매장', '매장 POS']];
export const STATUS_OPTIONS = [['', '전체'], ['ok', '정상'], ['cancel', '취소']];
export const KIND_OPTIONS = [['', '전체'], ...['배민 배달', '배민 포장', '쿠팡 배달', '쿠팡 포장', '요기요 배달', '전화 배달', '방문 포장', '테이블 포장', '테이블 식사', '키오스크', '매장 기타'].map((k) => [k, k])];

const pick = (v, opts) => (opts.some(([k]) => k && k === v) ? v : '');

export function parseOrderFilters(sp) {
  return {
    type: pick(sp.type, TYPE_OPTIONS),
    channel: pick(sp.channel, CHANNEL_OPTIONS),
    status: pick(sp.status, STATUS_OPTIONS),
    kind: pick(sp.kind, KIND_OPTIONS),
    search: String(sp.q || '').trim().slice(0, 40),
  };
}

export const channelLabel = (c) => (c === '매장' ? '매장 POS' : c);
