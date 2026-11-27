import 'server-only';
import { cookies } from 'next/headers';
import { AMOUNT_COOKIE, amountOf } from './amount';

/** 현재 요청의 매출 금액 기준 { key, label, col, desc } — 쿠키가 없거나 잘못되면 순매출 */
export async function getAmount() {
  return amountOf((await cookies()).get(AMOUNT_COOKIE)?.value);
}
