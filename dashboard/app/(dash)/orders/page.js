import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import { requireUser } from '@/lib/auth';
import { parsePeriod, withParams } from '@/lib/period';
import { ORDER_PAGE_SIZE, orderItems, orderList, orderSummary, storeOptions } from '@/lib/queries';
import { won } from '@/lib/format';
import { CHANNEL_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS, parseOrderFilters } from './filters';
import OrdersTable from './OrdersTable';

export const metadata = { title: '주문 리포트 · 마마치킨' };

export default async function OrdersPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const p = parsePeriod(sp, 'yesterday');
  const store = sp.store || '';
  const f = parseOrderFilters(sp);
  const page = Math.max(1, Math.min(10000, Number(sp.page) || 1));
  const [stores, sum, list] = await Promise.all([storeOptions(), orderSummary(p, store, f), orderList(p, store, f, page)]);
  const items = await orderItems(list.map((o) => o.inv_seq));
  const total = list[0]?.total || 0;
  const pages = Math.ceil(total / ORDER_PAGE_SIZE);
  const { page: _pg, ...keep } = sp;
  const exportHref = `/orders/export${withParams(keep, {})}`;

  const cards = [
    ['주문', `${won(sum.orders)}건`, `취소 ${won(sum.cancels)}건`],
    ['총매출', `${won(sum.gross)}원`, '할인 전 정가'],
    ['할인', `${won(sum.dc)}원`, '총매출 - 실매출'],
    ['실매출', `${won(sum.paid)}원`, '결제액 · 부가세 포함'],
    ['순매출', `${won(sum.net)}원`, `부가세 ${won(sum.tax)}원 제외`],
  ];

  return (
    <>
      <div className="head">
        <div>
          <h1>주문 리포트</h1>
          <div className="muted">{p.label} · 주문 헤더(결제)와 주문 상세(메뉴)를 주문 단위로 조회합니다. 금액 합계는 취소를 차감한 값입니다.</div>
        </div>
        <a className="btn" href={exportHref}>CSV 내려받기</a>
      </div>
      <FilterBar
        periodKey={p.key} from={p.from} to={p.to} periods={['yesterday', 'week', 'month', 'lastmonth']} stores={stores}
        selects={[
          { name: 'type', label: '판매유형', options: TYPE_OPTIONS },
          { name: 'channel', label: '주문 채널', options: CHANNEL_OPTIONS },
          { name: 'status', label: '상태', options: STATUS_OPTIONS },
        ]}
      />
      <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(keep).filter(([k]) => k !== 'q').map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="search" name="q" defaultValue={f.search} placeholder="메뉴명으로 주문 찾기 (원래 표기·표준 메뉴)" aria-label="메뉴 검색"
          style={{ flex: '1 1 260px', minHeight: 40, border: '1px solid #DDD6CD', borderRadius: 8, padding: '0 12px' }} />
        <button className="btn" type="submit">검색</button>
        {f.search && <Link className="btn" href={withParams(keep, { q: '' })}>검색 해제</Link>}
      </form>

      <div className="grid4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {cards.map(([l, v, s]) => (
          <div key={l} className="card" style={{ padding: '14px 16px' }}>
            <span className="small muted">{l}</span><b className="big">{v}</b><span className="small muted">{s}</span>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="ph">
          <h2>주문 목록</h2>
          <span className="small muted">행을 누르면 주문 상세(메뉴·옵션)가 열립니다 · {won(total)}건 (취소 포함)</span>
        </div>
        {list.length === 0 ? <div className="empty">조건에 맞는 주문이 없습니다.</div> : <OrdersTable orders={list} items={items} />}
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            {page > 1 && <Link className="btn small" scroll={false} href={withParams(sp, { page: page - 1 })}>이전</Link>}
            <span className="small muted">{page} / {pages} 페이지</span>
            {page < pages && <Link className="btn small" scroll={false} href={withParams(sp, { page: page + 1 })}>다음</Link>}
          </div>
        )}
      </section>
    </>
  );
}
