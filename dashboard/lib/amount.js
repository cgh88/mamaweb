// 매출 금액 기준 (서버·클라이언트 공용). 선택값은 쿠키에 저장되어 모든 화면에 적용, 기본은 순매출
//   v_pos_order 컬럼: gross_amt 할인 전 / grand_total 할인 후 결제액(부가세 포함) / sub_tot 결제액 - 부가세
export const AMOUNT_COOKIE = 'mama_dash_amount';
export const DEFAULT_AMOUNT = 'net';

export const AMOUNTS = {
  net: { label: '순매출', col: 'sub_tot', desc: '할인·부가세 제외' },
  paid: { label: '실매출', col: 'grand_total', desc: '할인 후 결제액, 부가세 포함' },
  gross: { label: '총매출', col: 'gross_amt', desc: '할인 전 정가' },
};

export const amountOf = (key) => ({ key: AMOUNTS[key] ? key : DEFAULT_AMOUNT, ...(AMOUNTS[key] || AMOUNTS[DEFAULT_AMOUNT]) });
