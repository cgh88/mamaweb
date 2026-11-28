import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { addDays, todayKst, withParams } from '@/lib/period';
import { storeOptions } from '@/lib/queries';
import {
  BRAND_NAMES, EVENT_CATEGORIES, KIND_ORDER, baseForecast, brandStories, brandSummary, events, externalStatus, forecast,
  holidayImpact, holidays, weatherImpact,
} from '@/lib/external';
import { buildOutlook, holidaySummary, weatherSummary, wxIcon } from '@/lib/outlook';
import { won } from '@/lib/format';
import { EventDelete, EventForm } from './EventForms';

export const metadata = { title: '외부 인사이트 · 마마치킨' };

const kindTag = (k) => (k === '이벤트·할인' ? 'tag ev' : k === '신메뉴' ? 'tag menu' : 'tag');
const when = (ts) => new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const ago = (ts) => {
  const h = Math.floor((Date.now() - new Date(ts).getTime()) / 3600000);
  return h < 1 ? '방금' : h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
};
const pctDiff = (r) => `${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)}%`;

export default async function InsightsPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayKst();
  const yesterday = addDays(today, -1);
  const stores = (await storeOptions()).filter((s) => s.open).map((s) => s.store_name);
  const store = stores.includes(sp.store) ? sp.store : '';
  const brand = BRAND_NAMES.includes(sp.brand) ? sp.brand : '';
  const kind = KIND_ORDER.includes(sp.kind) || sp.kind === 'all' ? sp.kind : '';
  const [hols, evs, fc, base, wxRows, holRows, stories, summary, status, evList] = await Promise.all([
    holidays(today, addDays(today, 60)), events(today, addDays(today, 6), store), forecast(), baseForecast(store),
    weatherImpact(yesterday, store), holidayImpact(yesterday, store),
    brandStories({ days: 30, brand, kind, limit: 50 }), brandSummary(30), externalStatus(),
    events(addDays(today, -30), addDays(today, 120)),
  ]);
  const wx = weatherSummary(wxRows);
  const hol = holidaySummary(holRows);
  const outlook = buildOutlook({ today, store, base, holidays: hols, events: evs, forecast: fc, wx, hol });
  const weekTotal = outlook.reduce((s, d) => s + (d.expected || 0), 0);
  const nextHol = hols.find((h) => h.day > addDays(today, 6));

  // 브랜드 카드: 최근 30일 소식 수
  const brandCards = BRAND_NAMES.map((b) => {
    const rows = summary.filter((r) => r.brand === b);
    const get = (k) => rows.find((r) => r.kind === k)?.stories || 0;
    const last = rows.reduce((m, r) => (!m || r.last_at > m ? r.last_at : m), null);
    return { b, ev: get('이벤트·할인'), menu: get('신메뉴'), news: get('소식'), last };
  });
  const weatherKey = !!status.weather_last || !!status.forecast_at;

  // 날씨 영향 문장
  const wxInsights = Object.entries(wx.ratio).map(([k, r]) => [
    `${k} 비 오는 날 주문 ${pctDiff(r.orders)}`,
    `비 ${r.rainDays}일 평균 ${won(r.rain.orders)}건 · 맑은 날 ${r.dryDays}일 평균 ${won(r.dry.orders)}건${r.delivery ? ` · 배달만 ${pctDiff(r.delivery)}` : ''}`,
  ]);
  const tMax = Math.max(1, ...wx.temps.map((t) => Number(t.orders)));

  return (
    <>
      <div className="head">
        <div>
          <h1>외부 인사이트</h1>
          <div className="muted">날씨·공휴일·매장 이벤트와 경쟁 브랜드 동향 · 매일 06:00 갱신</div>
        </div>
        <div className="tabs" role="group" aria-label="매장">
          {[['', '운영 매장 전체'], ...stores.map((s) => [s, s])].map(([v, l]) => (
            <Link key={l} scroll={false} className={store === v ? 'on' : ''} href={withParams(sp, { store: v })}>{l}</Link>
          ))}
        </div>
      </div>

      {/* 1. 앞으로 7일 */}
      <section className="panel">
        <div className="ph">
          <h2>앞으로 7일 전망</h2>
          <span className="small muted">예상 주문 합계 {won(weekTotal)}건{base.chickenPerOrder ? ` · 생닭 약 ${won(outlook.reduce((s, d) => s + (d.chicken || 0), 0))}마리` : ''}</span>
        </div>
        <div className="scroll">
          <div className="days">
            {outlook.map((d) => (
              <div key={d.d} className={d.holiday ? 'day hol' : 'day'}>
                <div className="dt"><b className={d.weekend ? 'we' : ''}>{+d.d.slice(5, 7)}/{+d.d.slice(8)} ({d.dow})</b><span className="small muted">{d.d === today ? '오늘' : d.d === addDays(today, 1) ? '내일' : ''}</span></div>
                <div className="wx">
                  {d.fc ? (
                    <>
                      <span className="ic" aria-hidden="true">{wxIcon(d.fc)}</span>
                      <span>{d.fc.pty || d.fc.sky} {Math.round(d.fc.min_ta)}~{Math.round(d.fc.max_ta)}℃</span>
                      {Number(d.fc.pop) >= 30 && <span className="small" style={{ color: '#24477A' }}>강수 {d.fc.pop}%</span>}
                    </>
                  ) : <span className="small muted">{weatherKey ? '예보 없음' : '날씨 연동 전'}</span>}
                </div>
                <div><span className="exp">{d.expected ? won(d.expected) : '-'}</span><span className="small muted"> 건 예상</span></div>
                {d.chicken ? <span className="small muted">생닭 약 {won(d.chicken)}마리</span> : null}
                {d.notes.length > 0 && <span className="small muted" title="같은 요일 최근 4주 평균에 곱한 보정">{d.notes.join(' · ')}</span>}
                {d.holiday && <span className="ev h">🎌 {d.holiday}</span>}
                {d.events.map((e) => <span key={e.id} className="ev" title={`${e.category}${e.store_name ? ` · ${e.store_name}` : ''}${e.note ? ` · ${e.note}` : ''}`}>📌 {e.title}</span>)}
              </div>
            ))}
          </div>
        </div>
        <div className="small muted">
          예상 주문 = 같은 요일 최근 4주 평균(공휴일 제외){hol.median ? `, 공휴일은 최근 1년 공휴일 실적 비율(×${hol.median.toFixed(2)})` : ''}{Object.keys(wx.ratio).length ? ', 비 예보(강수확률 60% 이상)는 최근 1년 비 오는 날 비율' : ''}을 곱한 값입니다. 생닭은 레시피 기준 주문당 사용량으로 환산했습니다.
          {nextHol && ` 다음 공휴일: ${nextHol.day.slice(5).replace('-', '/')} ${nextHol.name}.`}
        </div>
      </section>

      {/* 2. 경쟁 브랜드 */}
      <section className="panel">
        <div className="ph">
          <h2>경쟁 브랜드 동향 <span className="small muted" style={{ fontWeight: 400 }}>치킨 매출 상위 5개 · 최근 30일</span></h2>
          <div className="tabs" role="group" aria-label="소식 분류">
            {[['', '이벤트·신메뉴'], ['이벤트·할인', '이벤트·할인'], ['신메뉴', '신메뉴'], ['all', '일반 소식 포함']].map(([v, l]) => (
              <Link key={l} scroll={false} className={kind === v ? 'on' : ''} href={withParams(sp, { kind: v })}>{l}</Link>
            ))}
          </div>
        </div>
        <div className="brandgrid">
          {brandCards.map((c) => (
            <Link key={c.b} scroll={false} href={withParams(sp, { brand: brand === c.b ? '' : c.b })} aria-pressed={brand === c.b}>
              <div className={brand === c.b ? 'card on' : 'card'}>
                <b>{c.b}</b>
                <span className="small"><span className="tag ev">이벤트·할인 {c.ev}</span> <span className="tag menu">신메뉴 {c.menu}</span></span>
                <span className="small muted">소식 {c.news} · {c.last ? `최근 ${ago(c.last)}` : '소식 없음'}</span>
              </div>
            </Link>
          ))}
        </div>
        {stories.length === 0 ? <div className="empty">{status.news_at ? '조건에 맞는 소식이 없습니다.' : '아직 수집된 소식이 없습니다. 매일 06:00에 수집합니다.'}</div> : (
          <div className="stories">
            {stories.map((s) => (
              <div key={s.story} className="story">
                <div><b className="small">{s.brand}</b><br /><span className={kindTag(s.kind)}>{s.kind}</span></div>
                <div>
                  <a href={s.link} target="_blank" rel="noopener noreferrer">{s.title}</a>
                  <div className="meta">{s.source || '언론사'}{s.articles > 1 ? ` 외 ${s.articles - 1}건 보도` : ''}</div>
                </div>
                <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{when(s.last_at)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="small muted">
          뉴스 검색({status.news_provider === 'naver' ? '네이버 뉴스 검색 API' : 'Google 뉴스'})으로 브랜드별 이벤트·할인·신메뉴 기사를 모아, 같은 내용의 기사는 하나로 묶었습니다.
          제목만 보여주며 원문은 언론사 사이트에서 열립니다. 분류는 제목 키워드로 자동 판정해 일부 틀릴 수 있습니다.
          {status.news_at && ` 마지막 수집 ${ago(status.news_at)}.`}
        </div>
      </section>

      {/* 3. 날씨·공휴일 영향 */}
      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>날씨와 주문</h2><span className="small muted">최근 1년 · 서울 관측 · 공휴일 제외</span></div>
          {!wx.has ? (
            <div className="notice">
              날씨 데이터가 아직 없습니다. 공공데이터포털(data.go.kr)에서 기상청 <b>지상(종관, ASOS) 일자료 조회서비스</b>와 <b>단기예보 조회서비스</b>를 활용신청한 뒤
              인증키를 알려 주시면 연동합니다. 과거 3년 날씨를 한 번에 받아 매출과 비교합니다.
            </div>
          ) : (
            <>
              {wxInsights.map(([t, s]) => <div key={t} className="ins"><b>{t}</b><span className="small muted">{s}</span></div>)}
              <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>기온대별 하루 평균 주문</h3>
              {wx.temps.map((t) => (
                <div key={t.temp} className="wxbar">
                  <span>{t.temp} <span className="small muted">({t.days}일)</span></span>
                  <div className="track"><div className="fill" style={{ width: `${(Number(t.orders) / tMax) * 100}%`, background: 'var(--amber)' }} /></div>
                  <b style={{ textAlign: 'right' }}>{won(t.orders)}건</b>
                </div>
              ))}
            </>
          )}
        </section>
        <section className="panel">
          <div className="ph"><h2>공휴일과 주문</h2><span className="small muted">평소 같은 요일 대비</span></div>
          {hol.count === 0 ? <div className="empty">최근 1년 공휴일 실적이 없습니다.</div> : (
            <>
              {hol.median && <div className="ins"><b>공휴일 주문은 평소 같은 요일의 {Math.round(hol.median * 100)}% 수준</b><span className="small muted">최근 1년 공휴일 {hol.count}일 중앙값</span></div>}
              <div className="scroll">
                <table>
                  <thead><tr><th className="l">날짜</th><th className="l">공휴일</th><th>주문</th><th>평소</th><th>차이</th></tr></thead>
                  <tbody>
                    {holRows.slice(0, 12).map((h) => {
                      const r = Number(h.orders) / Number(h.base_orders);
                      return (
                        <tr key={h.day}>
                          <td className="l">{h.day.slice(2).replace(/-/g, '.')}</td><td className="l">{h.name}</td>
                          <td>{won(h.orders)}</td><td className="muted">{won(h.base_orders)}</td>
                          <td className={r >= 1 ? 'up' : 'down'}>{pctDiff(r)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {/* 4. 매장 이벤트 */}
      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>매장 이벤트 등록</h2><span className="small muted">학사일정·경기·프로모션 등</span></div>
          <EventForm categories={EVENT_CATEGORIES} stores={stores} today={today} />
          <div className="small muted">등록한 이벤트는 7일 전망과 매출 현황의 일별 그래프에 표시됩니다. 고려대 시험기간·축제, 국가대표 경기, 배달앱 할인 행사처럼 주문에 영향을 주는 일을 적어 두면 나중에 효과를 비교할 수 있습니다.</div>
        </section>
        <section className="panel">
          <div className="ph"><h2>등록된 이벤트</h2><span className="small muted">지난 30일 ~ 앞으로 4개월</span></div>
          {evList.length === 0 ? <div className="empty">등록된 이벤트가 없습니다.</div> : (
            <div className="scroll">
              <table>
                <thead><tr><th className="l">기간</th><th className="l">이벤트</th><th className="l">매장</th><th /></tr></thead>
                <tbody>
                  {evList.map((e) => (
                    <tr key={e.id}>
                      <td className="l" style={{ whiteSpace: 'nowrap' }}>{e.date_from.slice(5).replace('-', '/')}{e.date_to !== e.date_from ? `~${e.date_to.slice(5).replace('-', '/')}` : ''}</td>
                      <td className="l"><span className="tag">{e.category}</span> {e.title}{e.note && <div className="small muted">{e.note}</div>}</td>
                      <td className="l">{e.store_name || '전 매장'}</td>
                      <td><EventDelete id={e.id} title={e.title} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
