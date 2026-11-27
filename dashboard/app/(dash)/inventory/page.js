import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { addDays, todayKst, withParams } from '@/lib/period';
import { openStores, stockHistory, stockStatus } from '@/lib/inventory';
import { AVG_DAYS, WARN_DAYS, packFmt, qtyFmt } from '@/lib/stock';
import StockForms from './StockForms';
import HistoryDelete from './HistoryDelete';

export const metadata = { title: '재고·안전재고 · 마마치킨' };

const TAG = { low: 'tag warn', warn: 'tag', ok: 'tag on', nosafety: 'tag off', nocount: 'tag off' };
const ORDER = { low: 0, warn: 1, nocount: 2, nosafety: 3, ok: 4 };

export default async function InventoryPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const stores = await openStores();
  const store = stores.includes(sp.store) ? sp.store : stores[0];
  const [rows, history] = store ? await Promise.all([stockStatus(store), stockHistory(store)]) : [[], []];
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
  const count = (s) => rows.filter((r) => r.status === s).length;
  const yesterday = addDays(todayKst(), -1);

  return (
    <>
      <div className="head">
        <div>
          <h1>재고·안전재고</h1>
          <div className="muted">마지막 실사 + 입고 − 판매로 쓴 양(레시피 기준)으로 어제 마감 재고를 추정하고, 안전재고 아래로 내려가면 알려 드립니다.</div>
        </div>
        <div className="seg" role="group" aria-label="매장">
          {stores.map((s) => <Link key={s} scroll={false} className={s === store ? 'on' : ''} href={withParams({}, { store: s })}>{s}</Link>)}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="panel empty">등록된 식자재가 없습니다. <Link href="/recipes">레시피·식자재</Link>에서 식자재와 레시피를 먼저 입력하세요.</div>
      ) : (
        <>
          <div className="grid4">
            <div className="card" style={count('low') ? { borderColor: '#F0A58E', background: '#FFF6F3' } : undefined}>
              <span className="label">부족</span><b className="big down">{count('low')}개</b><span className="small muted">추정 재고 ≤ 안전재고</span>
            </div>
            <div className="card"><span className="label">주의</span><b className="big">{count('warn')}개</b><span className="small muted">안전재고까지 {WARN_DAYS}일치 이하</span></div>
            <div className="card"><span className="label">실사 필요</span><b className="big">{count('nocount')}개</b><span className="small muted">실사 수량을 한 번도 입력하지 않음</span></div>
            <div className="card"><span className="label">안전재고 미설정</span><b className="big">{count('nosafety')}개</b><span className="small muted">알람을 받으려면 안전재고 입력</span></div>
          </div>

          <section className="panel">
            <div className="ph"><h2>{store} 재고 현황</h2><span className="small muted">{yesterday} 마감 기준 · 일평균은 최근 {AVG_DAYS}일 판매 기준</span></div>
            <div className="scroll">
              <table>
                <thead>
                  <tr><th className="l">상태</th><th className="l">식자재</th><th>추정 재고</th><th>안전재고</th><th>일평균 사용</th><th>남은 일수</th>
                    <th className="l">마지막 실사</th><th>이후 입고</th><th>이후 사용</th></tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} style={r.status === 'low' ? { background: '#FFF6F3' } : undefined}>
                      <td className="l"><span className={TAG[r.status]}>{r.label}</span></td>
                      <td className="l"><b>{r.name}</b></td>
                      <td><b className={r.status === 'low' ? 'down' : ''}>{r.est === null ? '-' : qtyFmt(r.est)}</b> {r.est === null ? '' : r.unit}
                        {r.est !== null && packFmt(r.est, r) && <div className="small muted">{packFmt(r.est, r)}</div>}</td>
                      <td>{r.safety_qty === null ? '-' : `${qtyFmt(r.safety_qty)} ${r.unit}`}</td>
                      <td>{r.avg_daily ? `${qtyFmt(r.avg_daily)} ${r.unit}` : '-'}</td>
                      <td>{r.daysLeft === null ? '-' : `${qtyFmt(r.daysLeft)}일`}</td>
                      <td className="l small">{r.count_date ? `${r.count_date} · ${qtyFmt(r.count_qty)}${r.unit}` : '-'}</td>
                      <td>{r.count_date ? `+${qtyFmt(r.received)}` : '-'}</td>
                      <td>{r.count_date ? `−${qtyFmt(r.used_since)}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="small muted">
              실사 수량은 그날 영업 마감 후(다음 날 오픈 전) 기준입니다. 판매 데이터는 매일 06:00에 어제분까지 들어오므로 오늘 판매분은 내일 반영됩니다.
              레시피가 없는 메뉴는 사용량에 들어가지 않아 추정 재고가 실제보다 많게 보일 수 있습니다.
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', gap: 16, alignItems: 'start' }} className="map-grid">
            <section className="panel" aria-label="재고 입력">
              <StockForms key={store} store={store} rows={rows} defaultDate={yesterday} today={todayKst()} />
            </section>
            <section className="panel">
              <div className="ph"><h2>최근 입력</h2><span className="small muted">실사·입고 30건</span></div>
              {history.length === 0 ? <div className="empty">입력 이력이 없습니다.</div> : (
                <table>
                  <thead><tr><th className="l">구분</th><th className="l">날짜</th><th className="l">식자재</th><th>수량</th><th /></tr></thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={`${h.kind}${h.id}`}>
                        <td className="l"><span className={h.kind === 'count' ? 'tag web' : 'tag'}>{h.kind === 'count' ? '실사' : '입고'}</span></td>
                        <td className="l small">{h.d}</td>
                        <td className="l" style={{ whiteSpace: 'normal' }}>{h.name}{h.note ? <div className="small muted">{h.note}</div> : null}</td>
                        <td>{qtyFmt(h.qty)} {h.unit}</td>
                        <td><HistoryDelete kind={h.kind} id={h.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
