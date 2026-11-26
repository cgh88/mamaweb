import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import { requireUser } from '@/lib/auth';
import { parsePeriod, withParams } from '@/lib/period';
import { byApp, byType, storeBreakdown, storeOptions, typeTrend } from '@/lib/queries';
import { pct, won } from '@/lib/format';

export const metadata = { title: '채널 분석 · 마마치킨' };

const COLORS = { 배달: '#E5482B', 매장: '#2F5D9E', 포장: '#E59A2F', 배달의민족: '#E5482B', 쿠팡이츠: '#E59A2F', 요기요: '#8A5BA8' };
const colorOf = (name, i) => COLORS[name] || ['#2F5D9E', '#6B8F3A', '#8A817A'][i % 3];

export default async function ChannelPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const p = parsePeriod(sp);
  const store = sp.store || '';
  const view = sp.view === 'app' ? 'app' : 'type';
  const [stores, list, trend, byStore] = await Promise.all([
    storeOptions(),
    view === 'app' ? byApp(p.from, p.to, store) : byType(p.from, p.to, store),
    typeTrend(p.to, store),
    storeBreakdown(p, store),
  ]);
  const total = list.reduce((s, r) => s + r.rev, 0);
  const rows = list.map((r, i) => ({
    ...r, color: colorOf(r.name, i), share: pct(r.rev, total),
    aov: r.orders ? r.rev / r.orders : 0, cancelRate: pct(r.cancels, Number(r.orders) + Number(r.cancels)),
  }));

  // 월별 판매유형 비중
  const months = [...new Set(trend.map((r) => r.m))];
  const trendRows = months.map((m) => {
    const t = trend.filter((r) => r.m === m);
    const sum = t.reduce((s, r) => s + r.rev, 0) || 1;
    const get = (n) => Math.max(0, (t.find((r) => r.name === n)?.rev || 0) / sum * 100);
    return { m, d: get('배달'), s: get('매장'), t: get('포장') };
  });

  // 자동 인사이트
  const insights = [];
  if (view === 'type' && rows.length) {
    const top = rows[0];
    insights.push([`${top.name} 비중 ${top.share}%`, `매출 ${won(top.rev)}원 · 주문 ${won(top.orders)}건`]);
    const totalCancels = rows.reduce((s, r) => s + Number(r.cancels), 0);
    const dc = rows.find((r) => r.name === '배달');
    if (totalCancels && dc) insights.push([`취소 ${totalCancels}건 중 ${dc.cancels}건이 배달 주문`, `배달 취소율 ${dc.cancelRate}%`]);
    const hi = [...rows].sort((a, b) => b.aov - a.aov)[0];
    insights.push([`객단가가 가장 높은 유형: ${hi.name}`, `${won(hi.aov)}원`]);
  }
  if (view === 'app') {
    const apps = rows.filter((r) => r.name !== '매장' && r.name !== '기타');
    // 주문이 너무 적은 채널(예: 요기요 몇 건)은 객단가 비교에서 제외
    const comparable = apps.filter((r) => r.orders >= 30);
    if (comparable.length >= 2) {
      const [a, b] = [...comparable].sort((x, y) => y.aov - x.aov);
      insights.push([`${a.name} 객단가가 ${b.name}보다 ${pct(a.aov - b.aov, b.aov)}% 높습니다`, `${won(a.aov)}원 · ${won(b.aov)}원`]);
    }
    const app = apps.reduce((s, r) => s + r.rev, 0);
    insights.push([`배달앱 주문 비중 ${pct(app, total)}%`, `매장 POS(홀·포장·전화) 제외`]);
  }
  if (byStore.length >= 2) {
    const parts = byStore.slice(0, 2).map((s) => `${s.store_name} 배달 ${pct(s.delivery || 0, s.rev, 0)}%`);
    insights.push(['매장별 배달 의존도', parts.join(' · ')]);
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>채널 분석</h1>
          <div className="muted">{p.label} · 판매유형(배달·매장·포장)과 주문 채널(배달앱)별 결제 금액</div>
        </div>
      </div>
      <FilterBar periodKey={p.key} from={p.from} to={p.to} periods={['week', 'month', 'lastmonth', '12w', 'year']} stores={stores} />

      <section className="panel">
        <div className="ph">
          <h2>{view === 'app' ? '주문 채널별 매출' : '판매유형별 매출'}</h2>
          <div className="seg" role="group" aria-label="보기 기준">
            <Link scroll={false} className={view === 'type' ? 'on' : ''} href={withParams(sp, { view: '' })}>판매유형</Link>
            <Link scroll={false} className={view === 'app' ? 'on' : ''} href={withParams(sp, { view: 'app' })}>주문 채널</Link>
          </div>
        </div>
        {rows.length === 0 ? <div className="empty">이 기간에 매출이 없습니다.</div> : (
          <>
            <div className="full" role="img" aria-label={rows.map((r) => `${r.name} ${r.share}%`).join(', ')}>
              {rows.filter((r) => r.rev > 0).map((r) => (
                <div key={r.name} style={{ width: `${r.share}%`, background: r.color }}>{Number(r.share) >= 6 ? `${r.name} ${r.share}%` : ''}</div>
              ))}
            </div>
            <div className="grid3">
              {rows.map((r) => (
                <div key={r.name} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}><i className="sw" style={{ background: r.color }} />{r.name}</div>
                  <div className="big">{won(r.rev)}<span className="small muted" style={{ fontWeight: 500 }}> 원 · {r.share}%</span></div>
                  <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">주문</span><span>{won(r.orders)}건</span></div>
                  <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">객단가</span><span>{won(r.aov)}원</span></div>
                  <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">취소</span><span>{r.cancels}건 · {r.cancelRate}%</span></div>
                </div>
              ))}
            </div>
            {view === 'app' && <div className="small muted">주문 채널은 주문상세의 메뉴 코드로 판정합니다 (배달앱 주문은 앱별 코드, 그 외는 매장 POS).</div>}
          </>
        )}
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="ph">
            <h2>월별 판매유형 비중</h2>
            <div className="legend"><span><i className="sw" style={{ background: '#E5482B' }} />배달</span><span><i className="sw" style={{ background: '#2F5D9E' }} />매장</span><span><i className="sw" style={{ background: '#E59A2F' }} />포장</span></div>
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', height: 210, borderBottom: '1px solid var(--line)' }}>
            {trendRows.map((r) => (
              <div key={r.m} title={`${r.m} 배달 ${r.d.toFixed(1)}% · 매장 ${r.s.toFixed(1)}% · 포장 ${r.t.toFixed(1)}%`}
                style={{ flex: '1 1 0', height: 200, display: 'flex', flexDirection: 'column', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: `${r.t}%`, background: '#E59A2F' }} />
                <div style={{ height: `${r.s}%`, background: '#2F5D9E' }} />
                <div style={{ height: `${r.d}%`, background: '#E5482B' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            {trendRows.map((r) => <div key={r.m} className="xl" style={{ flex: '1 1 0', textAlign: 'center' }}>{+r.m.slice(5)}월<br />배달 {r.d.toFixed(1)}%</div>)}
          </div>
        </section>

        <section className="panel">
          <div className="ph"><h2>눈여겨볼 점</h2><span className="small muted">선택 기간 자동 요약</span></div>
          {insights.map(([t, s]) => <div key={t} className="ins"><b>{t}</b><span className="small muted">{s}</span></div>)}
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>매장 × 판매유형</h2><span className="small muted">매출 (비중) · 객단가</span></div>
        <div className="scroll">
          <table>
            <thead><tr><th className="l">매장</th><th>배달</th><th>매장</th><th>포장</th><th>합계</th><th>배달 객단가</th><th>매장 객단가</th></tr></thead>
            <tbody>
              {byStore.map((s) => (
                <tr key={s.store_name}>
                  <td className="l"><b>{s.store_name}</b></td>
                  <td>{won(s.delivery || 0)} ({pct(s.delivery || 0, s.rev)}%)</td>
                  <td>{won(s.dinein || 0)} ({pct(s.dinein || 0, s.rev)}%)</td>
                  <td>{won(s.takeout || 0)} ({pct(s.takeout || 0, s.rev)}%)</td>
                  <td>{won(s.rev)}</td>
                  <td>{won(s.delivery_orders ? s.delivery / s.delivery_orders : 0)}</td>
                  <td>{won(s.dinein_orders ? s.dinein / s.dinein_orders : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
