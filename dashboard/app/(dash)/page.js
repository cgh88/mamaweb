import ExportButton from '@/components/ExportButton';
import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import { requireUser } from '@/lib/auth';
import { getAmount } from '@/lib/amount-server';
import { addDays, parsePeriod } from '@/lib/period';
import { dailyRecent, monthlyByStore, overview, storeBreakdown, storeOptions } from '@/lib/queries';
import { delta, pct, won } from '@/lib/format';

export const metadata = { title: '매출 현황 · 마마치킨' };

const STORE_COLORS = ['#E5482B', '#2F5D9E', '#E59A2F', '#6B8F3A', '#8A5BA8'];
const CLOSED_COLOR = '#BDB4AB';
const CHART_DAYS = 14;

export default async function OverviewPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const p = parsePeriod(sp);
  const store = sp.store || '';
  const amt = await getAmount();
  const [stores, ov, days, byStore, monthly] = await Promise.all([
    storeOptions(), overview(p, store), dailyRecent(p.to, store, CHART_DAYS, p.cmp === 'yoy' ? 364 : 7), storeBreakdown(p, store), monthlyByStore(p.to, store),
  ]);
  const { cur, base, lfl } = ov;
  const aov = (k) => (k.orders ? k.rev / k.orders : 0);
  const cancelRate = (k) => pct(k.cancels, Number(k.orders) + Number(k.cancels));
  const kpis = [
    { label: amt.label, value: won(cur.rev), unit: '원', d: delta(cur.rev, base.rev) },
    { label: '주문 수', value: won(cur.orders), unit: '건', d: delta(cur.orders, base.orders) },
    { label: '객단가', value: won(aov(cur)), unit: '원', d: delta(aov(cur), aov(base)) },
    {
      label: '취소', value: won(cur.cancels), unit: `건 · ${cancelRate(cur)}%`,
      d: { text: `${cur.cancels - base.cancels >= 0 ? '▲' : '▼'} ${Math.abs(cur.cancels - base.cancels)}건`, cls: cur.cancels > base.cancels ? 'down' : 'up' },
      note: `비교 ${base.cancels}건 (${cancelRate(base)}%) · 배달 취소 ${cur.delivery_cancels}건`,
    },
  ];

  // 일별 막대: 기간 마지막 날까지 최근 14일 (선택 기간에 든 날짜는 라벨 굵게) + 비교 점
  //   비교: 전주 같은 요일, 전년 비교 선택 시 52주 전 같은 요일
  const shift = p.cmp === 'yoy' ? 364 : 7;
  const byDate = Object.fromEntries(days.map((r) => [r.d, r]));
  const bars = Array.from({ length: CHART_DAYS }, (_, i) => {
    const d = addDays(p.to, i - (CHART_DAYS - 1));
    const x = byDate[d] || { rev: 0, orders: 0 };
    const prev = byDate[addDays(d, -shift)]?.rev || 0;
    const dow = new Date(d + 'T00:00:00Z').getUTCDay();
    return {
      d, rev: x.rev, prev, inPeriod: d >= p.from,
      label: `${+d.slice(5, 7)}/${+d.slice(8)}`,
      weekend: dow === 0 || dow === 6,
      title: `${d} (${'일월화수목금토'[dow]}) · 매출 ${won(x.rev)}원 · 주문 ${x.orders}건 · 객단가 ${won(x.orders ? x.rev / x.orders : 0)}원 · ${p.cmp === 'yoy' ? '52주 전' : '전주'} 같은 요일 ${won(prev)}원`,
    };
  });
  const max = Math.max(1, ...bars.map((b) => Math.max(b.rev, b.prev))) * 1.08;
  for (const b of bars) { b.h = Math.round((b.rev / max) * 200); b.ph = Math.round((b.prev / max) * 200); }
  const best = bars.reduce((a, b, i) => (b.rev > a.rev ? { rev: b.rev, i } : a), { rev: 0, i: -1 });
  const partialChart = p.from > bars[0].d;

  // 월별 매장 누적 막대
  const months = [...new Set(monthly.map((r) => r.m))];
  const openSet = new Set(stores.filter((s) => s.open).map((s) => s.store_name));
  // 운영 매장(매출 큰 순) → 폐점 매장 순으로 범례·색 지정
  const storeRev = monthly.reduce((a, r) => ({ ...a, [r.store_name]: (a[r.store_name] || 0) + r.rev }), {});
  const storeNames = Object.keys(storeRev).sort((a, b) => (openSet.has(b) - openSet.has(a)) || storeRev[b] - storeRev[a]);
  const color = (name, i) => (openSet.has(name) ? STORE_COLORS[i % STORE_COLORS.length] : CLOSED_COLOR);
  const storeColor = Object.fromEntries(storeNames.map((s, i) => [s, color(s, i)]));
  const mTotals = months.map((m) => monthly.filter((r) => r.m === m).reduce((s, r) => s + r.rev, 0));
  const mMax = Math.max(1, ...mTotals) * 1.05;
  const curMonth = p.to.slice(0, 7);
  const monthEnd = new Date(Date.UTC(+p.to.slice(0, 4), +p.to.slice(5, 7), 0)).toISOString().slice(0, 10);
  const partialMonth = p.to < monthEnd;

  const total = byStore.reduce((s, r) => s + r.rev, 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>매출 현황</h1>
          <div className="muted">{p.label} · {amt.label} 기준 ({amt.desc}, 취소 차감)</div>
        </div>
        <ExportButton view="overview" sp={sp} />
      </div>
      <FilterBar periodKey={p.key} from={p.from} to={p.to} periods={['yesterday', 'week', 'month', 'lastmonth', 'year']} cmp={p.cmp} stores={stores} amount={amt.key} />

      <div className="grid4">
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <div className="label">{k.label}</div>
            <div className="val">{k.value}<small>{k.unit}</small></div>
            <div className="small"><span className={k.d.cls}>{k.d.text}</span> <span className="muted">{k.note || p.cmpLabel}</span></div>
          </div>
        ))}
      </div>
      {lfl && (
        <div className="notice">전년 비교는 두 기간 모두 매출이 있는 매장({lfl.join('·') || '없음'})만 비교합니다. 그 사이 폐점·개점한 매장은 제외됩니다.</div>
      )}

      <section className="panel">
        <div className="ph">
          <h2>일별 매출 <span className="small muted" style={{ fontWeight: 400 }}>최근 {CHART_DAYS}일</span></h2>
          <div className="legend">
            <span><i className="sw" style={{ background: '#E5482B' }} />매출</span>
            <span><i className="sw" style={{ background: '#fff', border: '2px solid #2F5D9E', borderRadius: '50%' }} />{p.cmp === 'yoy' ? '52주 전 같은 요일' : '전주 같은 요일'}</span>
            {best.i >= 0 && <span>최고 {bars[best.i].label} {won(best.rev)}원</span>}
          </div>
        </div>
        <div className="scroll">
          <div className="chart" style={{ minWidth: 520 }}>
            {bars.map((b, i) => (
              <div key={i} className="col" title={b.title}>
                <div className="plot">
                  <div className="b" style={{ height: b.h }} />
                  {b.ph > 0 && <div className="dot" style={{ bottom: b.ph }} />}
                </div>
                <div className={b.weekend ? 'xl we' : 'xl'} style={partialChart && b.inPeriod ? { fontWeight: 700 } : undefined}>{b.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="small muted">기간 마지막 날까지 최근 {CHART_DAYS}일을 보여줍니다.{partialChart && ' 선택 기간에 든 날짜는 굵게 표시합니다.'} 막대에 마우스를 올리면 그날 매출·주문 수·객단가와 비교 값을 볼 수 있습니다. 주말 날짜는 붉게 표시합니다.</div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>매장별 성과</h2><span className="small muted">{p.label}</span></div>
          {byStore.length === 0 ? <div className="empty">이 기간에 매출이 없습니다.</div> : (
            <div className="scroll">
              <table>
                <thead><tr><th className="l">매장</th><th>매출</th><th>비중</th><th>주문</th><th>객단가</th><th className="l">배달·매장·포장</th></tr></thead>
                <tbody>
                  {byStore.map((s) => {
                    const d = pct(s.delivery || 0, s.rev, 0); const m = pct(s.dinein || 0, s.rev, 0); const t = pct(s.takeout || 0, s.rev, 0);
                    return (
                      <tr key={s.store_name}>
                        <td className="l"><b>{s.store_name}</b> {!s.open && <span className="tag off">폐점</span>}</td>
                        <td>{won(s.rev)}</td>
                        <td>{pct(s.rev, total)}%</td>
                        <td>{won(s.orders)}</td>
                        <td>{won(s.orders ? s.rev / s.orders : 0)}</td>
                        <td className="l">
                          <div className="mix" aria-label={`배달 ${d}% 매장 ${m}% 포장 ${t}%`}>
                            <div style={{ width: `${d}%`, background: '#E5482B' }} />
                            <div style={{ width: `${m}%`, background: '#2F5D9E' }} />
                            <div style={{ width: `${t}%`, background: '#E59A2F' }} />
                          </div>
                          <div className="small muted" style={{ marginTop: 4 }}>배달 {d}% · 매장 {m}% · 포장 {t}%</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Link href="/stores" className="small" style={{ fontWeight: 600 }}>매장 비교 자세히 보기 →</Link>
        </section>

        <section className="panel">
          <div className="ph">
            <h2>월별 매출 추이</h2>
            <div className="legend">
              {storeNames.map((s) => (
                <span key={s}><i className="sw" style={{ background: storeColor[s] }} />{s}{openSet.has(s) ? '' : ' (폐점)'}</span>
              ))}
            </div>
          </div>
          <div className="stack">
            {months.map((m, i) => (
              <div key={m} className={m === curMonth && partialMonth ? 'scol partial' : 'scol'} title={`${m} 합계 ${won(mTotals[i])}원`}>
                {[...storeNames].reverse().map((s) => {
                  const v = monthly.find((r) => r.m === m && r.store_name === s)?.rev || 0;
                  return v > 0 ? <div key={s} style={{ height: Math.round((v / mMax) * 190), background: storeColor[s] }} /> : null;
                })}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {months.map((m) => <div key={m} className="xl" style={{ flex: '1 1 0', textAlign: 'center' }}>{+m.slice(5)}월</div>)}
          </div>
          <div className="small muted">{partialMonth ? `${+curMonth.slice(5)}월은 ${+p.to.slice(8)}일까지의 값이라 옅게 표시합니다.` : '최근 12개월'}</div>
        </section>
      </div>
    </>
  );
}
