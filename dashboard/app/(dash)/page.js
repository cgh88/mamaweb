import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import { requireUser } from '@/lib/auth';
import { daysBetween, parsePeriod } from '@/lib/period';
import { daily, monthlyByStore, overview, storeBreakdown, storeOptions } from '@/lib/queries';
import { delta, pct, won } from '@/lib/format';

export const metadata = { title: '매출 현황 · 마마치킨' };

const STORE_COLORS = ['#E5482B', '#2F5D9E', '#E59A2F', '#6B8F3A', '#8A5BA8'];
const CLOSED_COLOR = '#BDB4AB';

export default async function OverviewPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const p = parsePeriod(sp);
  const store = sp.store || '';
  const [stores, ov, days, byStore, monthly] = await Promise.all([
    storeOptions(), overview(p, store), daily(p, store), storeBreakdown(p, store), monthlyByStore(p.to, store),
  ]);
  const { cur, base, lfl } = ov;
  const aov = (k) => (k.orders ? k.rev / k.orders : 0);
  const cancelRate = (k) => pct(k.cancels, Number(k.orders) + Number(k.cancels));
  const kpis = [
    { label: '매출', value: won(cur.rev), unit: '원', d: delta(cur.rev, base.rev) },
    { label: '주문 수', value: won(cur.orders), unit: '건', d: delta(cur.orders, base.orders) },
    { label: '객단가', value: won(aov(cur)), unit: '원', d: delta(aov(cur), aov(base)) },
    {
      label: '취소', value: won(cur.cancels), unit: `건 · ${cancelRate(cur)}%`,
      d: { text: `${cur.cancels - base.cancels >= 0 ? '▲' : '▼'} ${Math.abs(cur.cancels - base.cancels)}건`, cls: cur.cancels > base.cancels ? 'down' : 'up' },
      note: `비교 ${base.cancels}건 (${cancelRate(base)}%) · 배달 취소 ${cur.delivery_cancels}건`,
    },
  ];

  // 일별(62일 초과 시 주별) 막대 + 비교 기간 같은 순번의 값
  const weekly = p.days > 62;
  const bucket = (d, start) => {
    const i = daysBetween(start, d) - 1;
    return weekly ? Math.floor(i / 7) : i;
  };
  const n = weekly ? Math.ceil(p.days / 7) : p.days;
  const curArr = Array.from({ length: n }, () => ({ rev: 0, orders: 0 }));
  const prevArr = Array(n).fill(0);
  for (const r of days.cur) { const b = curArr[bucket(r.d, p.from)]; if (b) { b.rev += r.rev; b.orders += r.orders; } }
  for (const r of days.prev) { const i = bucket(r.d, p.cmpFrom); if (i < n) prevArr[i] += r.rev; }
  const max = Math.max(1, ...curArr.map((x) => x.rev), ...prevArr) * 1.08;
  const bars = curArr.map((x, i) => {
    const date = new Date(Date.parse(p.from + 'T00:00:00Z') + i * (weekly ? 7 : 1) * 86400000);
    const dow = date.getUTCDay();
    return {
      h: Math.round((x.rev / max) * 200), ph: Math.round((prevArr[i] / max) * 200),
      label: weekly ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : String(date.getUTCDate()),
      weekend: !weekly && (dow === 0 || dow === 6),
      title: `${date.toISOString().slice(0, 10)}${weekly ? ' 주' : ''} · 매출 ${won(x.rev)}원 · 주문 ${x.orders}건 · 객단가 ${won(x.orders ? x.rev / x.orders : 0)}원 · 비교 ${won(prevArr[i])}원`,
    };
  });
  const best = curArr.reduce((a, x, i) => (x.rev > a.rev ? { rev: x.rev, i } : a), { rev: 0, i: -1 });

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
          <div className="muted">{p.label} · 결제 금액(취소 차감) 기준</div>
        </div>
      </div>
      <FilterBar periodKey={p.key} from={p.from} to={p.to} periods={['yesterday', 'week', 'month', 'lastmonth', 'year']} cmp={p.cmp} stores={stores} />

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
          <h2>{weekly ? '주별 매출' : '일별 매출'}</h2>
          <div className="legend">
            <span><i className="sw" style={{ background: '#E5482B' }} />선택 기간</span>
            <span><i className="sw" style={{ background: '#fff', border: '2px solid #2F5D9E', borderRadius: '50%' }} />{p.cmp === 'yoy' ? '전년 같은 날' : '비교 기간 같은 순번'}</span>
            {best.i >= 0 && <span>최고 {bars[best.i].label}{weekly ? '주' : '일'} {won(best.rev)}원</span>}
          </div>
        </div>
        <div className="scroll">
          <div className="chart" style={{ minWidth: Math.max(600, n * 22) }}>
            {bars.map((b, i) => (
              <div key={i} className="col" title={b.title}>
                <div className="plot">
                  <div className="b" style={{ height: b.h }} />
                  {b.ph > 0 && <div className="dot" style={{ bottom: b.ph }} />}
                </div>
                <div className={b.weekend ? 'xl we' : 'xl'}>{b.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="small muted">막대에 마우스를 올리면 그날 매출·주문 수·객단가와 비교 값을 볼 수 있습니다.{!weekly && ' 주말 날짜는 붉게 표시합니다.'}</div>
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
