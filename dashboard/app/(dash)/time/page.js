import FilterBar from '@/components/FilterBar';
import { requireUser } from '@/lib/auth';
import { parsePeriod } from '@/lib/period';
import { heatmap, storeOptions } from '@/lib/queries';
import { WEEKDAYS, pct, won } from '@/lib/format';

export const metadata = { title: '시간 분석 · 마마치킨' };

// 영업 시간대 순서 (자정 넘어 새벽 1시까지)
const HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];
const STOPS = [[251, 241, 236], [240, 165, 142], [217, 71, 43], [143, 36, 18]];
function heat(t) {
  const x = Math.min(0.999, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.floor(x);
  const k = x - i;
  return `rgb(${STOPS[i].map((v, j) => Math.round(v + (STOPS[i + 1][j] - v) * k)).join(',')})`;
}

export default async function TimePage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const p = parsePeriod(sp, '12w');
  const store = sp.store || '';
  const metric = sp.metric === 'rev' ? 'rev' : sp.metric === 'aov' ? 'aov' : 'orders';
  const saleType = ['배달', '매장', '포장'].includes(sp.type) ? sp.type : '';
  const [stores, cells] = await Promise.all([storeOptions(), heatmap(p, store, saleType)]);

  const get = (dow, h) => cells.find((c) => c.dow === dow && c.hour === h);
  const value = (c) => (!c ? 0 : metric === 'rev' ? c.rev : metric === 'aov' ? (c.orders ? c.rev / c.orders : 0) : c.orders);
  const show = (v) => (metric === 'orders' ? won(v) : won(v / (metric === 'rev' ? 10000 : 1)));
  const inHours = cells.filter((c) => HOURS.includes(c.hour));
  const outside = cells.filter((c) => !HOURS.includes(c.hour)).reduce((s, c) => s + c.orders, 0);
  const max = Math.max(1, ...inHours.map(value));
  const rows = WEEKDAYS.map((day, i) => {
    const dow = i + 1;
    const vals = HOURS.map((h) => value(get(dow, h)));
    const orders = cells.filter((c) => c.dow === dow).reduce((s, c) => s + c.orders, 0);
    return { day, vals, orders };
  });
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const rowMax = Math.max(1, ...rows.map((r) => r.orders));
  const hourly = HOURS.map((h) => cells.filter((c) => c.hour === h).reduce((s, c) => s + c.orders, 0));
  const hMax = Math.max(1, ...hourly);

  // 요약
  const peak = inHours.reduce((a, c) => (c.orders > (a?.orders || 0) ? c : a), null);
  const weeks = Math.max(1, p.days / 7);
  const evening = cells.filter((c) => [17, 18, 19].includes(c.hour)).reduce((s, c) => s + c.orders, 0);
  const lunch = (dows) => cells.filter((c) => dows.includes(c.dow) && [11, 12, 13].includes(c.hour)).reduce((s, c) => s + c.orders, 0) / dows.length;
  const weekdayLunch = lunch([1, 2, 3, 4]);
  const weekendLunch = lunch([6, 7]);
  const peakHour = HOURS[hourly.indexOf(hMax)];

  return (
    <>
      <div className="head">
        <div>
          <h1>시간 분석</h1>
          <div className="muted">{p.label} · 요일·시간대별 주문 패턴 (주문 접수 시각, 취소 제외)</div>
        </div>
      </div>
      <FilterBar
        periodKey={p.key} from={p.from} to={p.to} periods={['week', 'month', 'lastmonth', '12w', 'year']} stores={stores}
        selects={[
          { name: 'type', label: '판매유형', options: [['', '전체'], ['배달', '배달'], ['매장', '매장'], ['포장', '포장']] },
          { name: 'metric', label: '지표', options: [['', '주문 수'], ['rev', '매출(만원)'], ['aov', '객단가(원)']] },
        ]}
      />

      {totalOrders === 0 ? <div className="panel empty">이 기간에 주문이 없습니다.</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 1fr)', gap: 16 }} className="time-grid">
            <section className="panel">
              <div className="ph">
                <h2>요일 × 시간대 {metric === 'orders' ? '주문 수' : metric === 'rev' ? '매출 (만원)' : '객단가 (원)'}</h2>
                <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>적음 <span className="ramp" /> 많음</div>
              </div>
              <div className="scroll">
                <div className="hm" style={{ '--cols': HOURS.length }}>
                  <div />
                  {HOURS.map((h) => <div key={h} className="h">{h}시</div>)}
                  <div className="h" style={{ textAlign: 'right' }}>주문</div>
                  {rows.map((r) => (
                    <div key={r.day} style={{ display: 'contents' }}>
                      <div className="d">{r.day}</div>
                      {r.vals.map((v, j) => {
                        const t = v / max;
                        return (
                          <div key={j} className="c" style={{ background: heat(t), color: t > 0.5 ? '#fff' : '#3B2A22' }} title={`${r.day}요일 ${HOURS[j]}시 · ${show(v)}`}>
                            {v ? show(v) : ''}
                          </div>
                        );
                      })}
                      <div className="t">{won(r.orders)}</div>
                    </div>
                  ))}
                </div>
              </div>
              {outside > 0 && <div className="small muted">영업 시간 외(02~10시) 주문 {outside}건은 표에서 뺐습니다.</div>}
            </section>

            <section className="panel">
              <div className="ph"><h2>요약</h2></div>
              {peak && (
                <div className="ins">
                  <span className="small muted">가장 바쁜 시간</span>
                  <span className="big">{WEEKDAYS[peak.dow - 1]} {peak.hour}시</span>
                  <span className="small muted">{won(peak.orders)}건 · 주 평균 약 {Math.round(peak.orders / weeks)}건</span>
                </div>
              )}
              <div className="ins"><b>저녁 17–19시에 주문의 {pct(evening, totalOrders, 0)}%</b><span className="small muted">시간대 최고점 {peakHour}시</span></div>
              <div className="ins">
                <b>점심(11–13시) 평일 vs 주말</b>
                <span className="small muted">월~목 하루 평균 {Math.round(weekdayLunch)}건 · 토·일 {Math.round(weekendLunch)}건 ({pct(weekendLunch, weekdayLunch, 0)}%)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="small muted" style={{ fontWeight: 600 }}>요일별 주문</div>
                {rows.map((r) => (
                  <div key={r.day} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) 56px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <span>{r.day}</span>
                    <div className="track"><div className="fill" style={{ width: `${(r.orders / rowMax) * 100}%` }} /></div>
                    <span style={{ textAlign: 'right' }} className="num">{won(r.orders)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="ph"><h2>시간대별 주문 (전체 요일)</h2><span className="small muted">붉은 막대 = 17–19시</span></div>
            <div className="scroll">
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 150, borderBottom: '1px solid var(--line)', minWidth: 600 }}>
                {hourly.map((v, i) => (
                  <div key={i} title={`${HOURS[i]}시 ${v}건`} style={{ flex: '1 1 0', height: Math.round((v / hMax) * 140), borderRadius: '3px 3px 0 0', background: [17, 18, 19].includes(HOURS[i]) ? '#E5482B' : '#2F5D9E' }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, minWidth: 600 }}>
                {hourly.map((v, i) => <div key={i} className="xl" style={{ flex: '1 1 0', textAlign: 'center' }}>{HOURS[i]}시<br /><b style={{ color: 'var(--ink)' }}>{won(v)}</b></div>)}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
