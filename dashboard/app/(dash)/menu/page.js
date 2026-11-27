import ExportButton from '@/components/ExportButton';
import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import { requireUser } from '@/lib/auth';
import { parsePeriod, withParams } from '@/lib/period';
import { MENU_TAB_NAMES, attachRates, menuMix, menuRanking, storeOptions, weeklyTop } from '@/lib/queries';
import { delta, pct, won } from '@/lib/format';

export const metadata = { title: '메뉴 분석 · 마마치킨' };

// 2024-10 이전 주문상세는 기존 수집 프로그램 문제로 일부 누락 (메뉴 수량 과소)
const DETAIL_COMPLETE_FROM = '2024-11-01';

export default async function MenuPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const p = parsePeriod(sp);
  const store = sp.store || '';
  const tab = MENU_TAB_NAMES.includes(sp.tab) ? sp.tab : '전체';
  const [stores, ranking, mix, attach, weekly] = await Promise.all([
    storeOptions(), menuRanking(p, store, tab), menuMix(p, store), attachRates(p, store), weeklyTop(p.to, store),
  ]);
  const maxQ = Math.max(1, ...ranking.map((r) => r.qty));
  const cutTotal = mix.cuts.reduce((s, r) => s + r.qty, 0);
  const cutMax = Math.max(1, ...mix.cuts.map((r) => r.qty));
  const flavorTotal = mix.flavors.reduce((s, r) => s + r.qty, 0);
  const flavorColor = { 후라이드: '#E59A2F', '반반·소스선택': '#E5482B', '단일 소스': '#8F2412' };
  const sauceMax = Math.max(1, ...mix.sauces.map((r) => r.n));
  const co = Number(attach?.chicken_orders) || 0;
  const weeklyByMenu = [...new Set(weekly.map((r) => r.std_name))].map((name) => {
    const pts = weekly.filter((r) => r.std_name === name);
    const m = Math.max(1, ...pts.map((x) => x.qty));
    return { name, last: pts[pts.length - 1]?.qty || 0, pts: pts.map((x, i) => ({ h: Math.round((x.qty / m) * 52) + 4, last: i === pts.length - 1, title: `${x.wk} 주 ${won(x.qty)}개` })) };
  });

  return (
    <>
      <div className="head">
        <div>
          <h1>메뉴 분석</h1>
          <div className="muted">{p.label} · 배달앱마다 다른 메뉴명을 홈페이지 정상 메뉴로 묶어 집계 (수량 기준, 옵션 제외)</div>
        </div>
        <ExportButton view="menu" sp={sp} />
      </div>
      <FilterBar periodKey={p.key} from={p.from} to={p.to} periods={['yesterday', 'week', 'month', 'lastmonth', '12w', 'year']} stores={stores} extra={`비교: ${p.cmpLabel}`} />
      {p.from < DETAIL_COMPLETE_FROM && (
        <div className="notice">선택 기간에 2024년 10월 이전이 포함되어 있습니다. 그 기간 주문상세는 기존 수집 프로그램 문제로 일부 누락되어 메뉴 수량이 실제보다 적습니다 (매출 금액은 정상).</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16 }} className="menu-grid">
        <section className="panel">
          <div className="ph"><h2>판매 순위</h2><span className="small muted">수량</span></div>
          <div className="tabs" role="group" aria-label="분류">
            {MENU_TAB_NAMES.map((t) => <Link key={t} scroll={false} className={t === tab ? 'on' : ''} href={withParams(sp, { tab: t === '전체' ? '' : t })}>{t}</Link>)}
          </div>
          {ranking.length === 0 ? <div className="empty">이 기간에 판매가 없습니다.</div> : (
            <div className="scroll">
              <table>
                <thead><tr><th className="l">#</th><th className="l">메뉴</th><th className="l">분류</th><th>수량</th><th>비교 대비</th></tr></thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const d = delta(r.qty, r.prev_qty);
                    return (
                      <tr key={r.std_name}>
                        <td className="l"><span className={i < 3 ? 'rk top' : 'rk'}>{i + 1}</span></td>
                        <td className="l" style={{ whiteSpace: 'normal' }}><b>{r.std_name}</b> <span className={r.web ? 'tag web' : 'tag'}>{r.web ? '홈페이지 메뉴' : '표준명'}</span></td>
                        <td className="l muted">{r.category}</td>
                        <td><span style={{ display: 'inline-block', height: 8, borderRadius: 4, background: '#E5482B', width: Math.round((r.qty / maxQ) * 90), marginRight: 8, verticalAlign: 'middle' }} />{won(r.qty)}</td>
                        <td><span className={d.cls}>{d.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="small muted"><span className="tag web">홈페이지 메뉴</span> 홈페이지 정상 메뉴와 연결 · <span className="tag">표준명</span> 홈페이지에 없는 메뉴 — 묶음은 <Link href="/mapping">메뉴 매핑 관리</Link>에서 고칠 수 있습니다.</div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="panel">
            <div className="ph"><h2>치킨 부위</h2><span className="small muted">치킨 {won(cutTotal)}개</span></div>
            {mix.cuts.map((c, i) => (
              <div key={c.cut} className="hrow">
                <span>{c.cut}</span>
                <div className="track"><div className="fill" style={{ width: `${(c.qty / cutMax) * 100}%`, background: i === 0 ? '#E5482B' : '#2F5D9E' }} /></div>
                <span style={{ textAlign: 'right' }}>{won(c.qty)} · {pct(c.qty, cutTotal)}%</span>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="ph"><h2>맛 구성</h2><span className="small muted">치킨 기준</span></div>
            <div className="full" style={{ height: 32 }} role="img" aria-label={mix.flavors.map((f) => `${f.name} ${pct(f.qty, flavorTotal, 0)}%`).join(', ')}>
              {mix.flavors.map((f) => (
                <div key={f.name} style={{ width: `${pct(f.qty, flavorTotal)}%`, background: flavorColor[f.name], color: f.name === '후라이드' ? '#3B2A10' : '#fff' }}>
                  {Number(pct(f.qty, flavorTotal)) > 9 ? `${f.name} ${pct(f.qty, flavorTotal, 0)}%` : ''}
                </div>
              ))}
            </div>
            <div className="small muted">반반·소스선택은 배달앱에서 소스를 옵션으로 고르는 메뉴입니다. 고른 소스는 아래 소스 순위에 반영됩니다.</div>
          </section>
        </div>
      </div>

      <div className="grid3">
        <section className="panel">
          <div className="ph"><h2>소스 선택 순위</h2><span className="small muted">옵션 선택 + 단일 소스 치킨</span></div>
          {mix.sauces.length === 0 ? <div className="empty">데이터 없음</div> : mix.sauces.map((s) => (
            <div key={s.name} className="hrow">
              <span>{s.name}</span>
              <div className="track"><div className="fill" style={{ width: `${(s.n / sauceMax) * 100}%`, background: '#E5482B' }} /></div>
              <span style={{ textAlign: 'right' }}>{won(s.n)}회 {!s.web && <span className="tag warn">미등록</span>}</span>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="ph"><h2>함께 주문 비율</h2><span className="small muted">치킨 주문 {won(co)}건 중</span></div>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[['버거 추가', attach?.burger], ['사이드', attach?.side], ['딥·베이스 소스', attach?.dip], ['음료·주류', attach?.drink]].map(([l, v]) => (
              <div key={l} className="card" style={{ padding: 14 }}>
                <span className="small muted">{l}</span>
                <b className="big">{pct(Number(v) || 0, co)}%</b>
                <span className="small muted">{won(v)}건</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="ph"><h2>주간 추이 TOP 3</h2><span className="small muted">최근 12주 · 치킨</span></div>
          {weeklyByMenu.map((m) => (
            <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8 }}><b>{m.name}</b><span className="muted">마지막 주 {won(m.last)}개</span></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 56 }}>
                {m.pts.map((x, i) => <div key={i} title={x.title} style={{ flex: '1 1 0', height: x.h, borderRadius: '2px 2px 0 0', background: x.last ? '#E5482B' : '#2F5D9E' }} />)}
              </div>
            </div>
          ))}
          <div className="small muted">붉은 막대 = 마지막 주 (진행 중이면 일부 기간)</div>
        </section>
      </div>
    </>
  );
}
