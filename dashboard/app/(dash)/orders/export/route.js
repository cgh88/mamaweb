import { getUser } from '@/lib/auth';
import { parsePeriod } from '@/lib/period';
import { orderItems, orderList } from '@/lib/queries';
import { channelLabel, parseOrderFilters } from '../filters';

export const dynamic = 'force-dynamic';

const MAX_DAYS = 93;
// CSV 셀: 따옴표 이스케이프 + 수식으로 해석될 수 있는 앞글자 무력화 (엑셀 수식 주입 방지)
const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 주문 리포트 CSV: 주문 상세 1행 = 1줄, 앞에 주문 헤더 정보 반복 (상세 없는 주문은 헤더만 1줄) */
export async function GET(req) {
  const user = await getUser();
  if (!user || user.must_change) return new Response('로그인이 필요합니다.', { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const p = parsePeriod(sp, 'yesterday');
  if (p.days > MAX_DAYS) return new Response(`CSV는 최대 ${MAX_DAYS}일까지 내려받을 수 있습니다. 기간을 줄여 주세요.`, { status: 400 });
  const orders = await orderList(p, sp.store || '', parseOrderFilters(sp), 1, 0);
  const items = await orderItems(orders.map((o) => o.inv_seq));
  const byOrder = items.reduce((m, it) => m.set(it.inv_seq, [...(m.get(it.inv_seq) || []), it]), new Map());

  const head = ['영업일', '주문시각', '매장', '주문번호', '주문구분', '판매유형', '주문채널', '상태', '총매출', '할인', '실매출', '부가세', '순매출', '카드', '현금', '앱·기타',
    '상세순번', '원래표기', '표준메뉴', '분류', '옵션', '수량', '단가', '금액'];
  const lines = [head.map(cell).join(',')];
  for (const o of orders) {
    const h = [o.sale_date, o.order_time, o.store_name, o.inv_seq, o.order_kind, o.sale_type_name, channelLabel(o.channel), o.is_cancel ? '취소' : '정상',
      o.gross, o.dc, o.paid, o.tax, o.net, o.ax_card, o.ax_cash, o.ax_etc];
    const rows = byOrder.get(o.inv_seq) || [];
    if (!rows.length) lines.push([...h, '', '', '', '', '', '', '', ''].map(cell).join(','));
    for (const it of rows) {
      lines.push([...h, it.inv_nos, it.item_text, it.std_name, it.category, it.is_option ? 'Y' : '', it.qty, it.qtyprice, it.sumprice].map(cell).join(','));
    }
  }
  const name = `orders_${p.from}_${p.to}.csv`;
  return new Response(`﻿${lines.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
