import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import { requireUser } from '@/lib/auth';
import { parsePeriod, withParams } from '@/lib/period';
import { consumption, consumptionByMenu, consumptionDaily, openStores, recipeCoverage } from '@/lib/inventory';
import { pct, won } from '@/lib/format';
import { packFmt, qtyFmt } from '@/lib/stock';

export const metadata = { title: '식자재 소모량 · 마마치킨' };

export default async function ConsumptionPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const p = parsePeriod(sp, 'week');
  const stores = await openStores();
  const store = stores.includes(sp.store) ? sp.store : '';
  const [rows, byMenu, cov] = await Promise.all([consumption(p.from, p.to, store), consumptionByMenu(p.from, p.to, store), recipeCoverage(p.from, p.to, store)]);
  const sel = rows.find((r) => String(r.id) === sp.ing) || rows[0] || null;
  const daily = sel ? await consumptionDaily(p.from, p.to, store, sel.id) : [];
  const dMax = Math.max(1, ...daily.map((d) => d.used));
  const covPct = cov.total ? pct(cov.covered, cov.total, 0) : '0';

  return (
    <>
      <div className="head">
        <div>
          <h1>식자재 소모량</h1>
          <div className="muted">{p.label} · 주문 수량 × 레시피로 계산한 이론 사용량 (취소 차감, 옵션 포함)</div>
        </div>
        <Link className="btn" href="/recipes">레시피 관리</Link>
      </div>
      <FilterBar periodKey={p.key} from={p.from} to={p.to} periods={['yesterday', 'week', 'month', 'lastmonth', '12w']}
        stores={stores.map((s) => ({ store_name: s, open: true }))} />

      {Number(covPct) < 90 && (
        <div className="notice">
          이 기간 판매 수량의 {covPct}%만 레시피가 있어 실제 사용량보다 적게 계산됩니다.
          {' '}<Link href="/recipes">레시피 관리</Link>에서 아래 &lsquo;레시피 미등록 메뉴&rsquo;부터 입력하세요.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', gap: 16, alignItems: 'start' }} className="map-grid">
        <section className="panel">
          <div className="ph"><h2>식자재별 사용량</h2><span className="small muted">{store || '운영 매장 전체'} · {p.days}일 · 행을 누르면 일별·메뉴별 상세</span></div>
          {rows.length === 0 ? <div className="empty">레시피가 등록된 메뉴의 판매가 없습니다. 먼저 <Link href="/recipes">레시피</Link>를 입력하세요.</div> : (
            <div className="scroll">
              <table>
                <thead><tr><th className="l">식자재</th><th>사용량</th><th>발주 단위</th><th>일평균</th><th className="l">많이 쓴 메뉴</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const top = byMenu.filter((m) => m.ingredient_id === r.id).slice(0, 2);
                    const on = sel && sel.id === r.id;
                    return (
                      <tr key={r.id} style={on ? { background: '#FFF4EF' } : undefined}>
                        <td className="l"><Link scroll={false} href={withParams(sp, { ing: r.id })} style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>{r.name}</Link></td>
                        <td><b>{qtyFmt(r.used)}</b> {r.unit}</td>
                        <td className="small">{packFmt(r.used, r) || '-'}</td>
                        <td>{qtyFmt(r.used / p.days)} {r.unit}</td>
                        <td className="l small" style={{ whiteSpace: 'normal' }}>{top.map((m) => `${m.std_name} ${pct(m.used, r.used, 0)}%`).join(' · ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sel && (
            <section className="panel">
              <div className="ph"><h2>{sel.name} 일별 사용량</h2><span className="small muted">{sel.unit}</span></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140, borderBottom: '1px solid var(--line)' }} role="img"
                aria-label={`${sel.name} 일별 사용량, 최대 ${qtyFmt(dMax)}${sel.unit}`}>
                {daily.map((d) => (
                  <div key={d.d} title={`${d.d} · ${qtyFmt(d.used)}${sel.unit}`} style={{ flex: '1 1 0', height: `${Math.max(0, (d.used / dMax) * 100)}%`, background: 'var(--red)', borderRadius: '3px 3px 0 0', minWidth: 2 }} />
                ))}
              </div>
              <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.from}</span><span>최대 {qtyFmt(dMax)}{sel.unit}</span><span>{p.to}</span></div>
              <table>
                <thead><tr><th className="l">메뉴</th><th>판매</th><th>사용량</th><th>비중</th></tr></thead>
                <tbody>
                  {byMenu.filter((m) => m.ingredient_id === sel.id).slice(0, 10).map((m) => (
                    <tr key={m.std_name}><td className="l" style={{ whiteSpace: 'normal' }}>{m.std_name}</td><td>{won(m.menu_qty)}</td><td>{qtyFmt(m.used)}</td><td>{pct(m.used, sel.used, 0)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="panel">
            <div className="ph"><h2>레시피 미등록 메뉴</h2><span className="small muted">판매 수량 커버율 {covPct}%</span></div>
            {cov.missing.length === 0 ? <div className="empty">이 기간 판매된 메뉴는 모두 레시피가 있습니다.</div> : (
              <table>
                <thead><tr><th className="l">메뉴</th><th className="l">분류</th><th>판매</th></tr></thead>
                <tbody>
                  {cov.missing.map((m) => (
                    <tr key={`${m.category}|${m.std_name}`}>
                      <td className="l" style={{ whiteSpace: 'normal' }}>
                        <Link href={`/recipes?f=all&m=${Buffer.from(JSON.stringify([m.category, m.std_name])).toString('base64url')}`}>{m.std_name}</Link>
                      </td>
                      <td className="l small">{m.category}</td><td>{won(m.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
      <div className="small muted">이론 사용량은 레시피 기준이며 폐기·시식·조리 손실은 포함하지 않습니다. 실제 재고와의 차이는 재고 화면의 실사로 확인하세요.</div>
    </>
  );
}
