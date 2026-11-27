import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getAmount } from '@/lib/amount-server';
import AmountSwitch from '@/components/AmountSwitch';
import { addDays, daysBetween, todayKst, withParams } from '@/lib/period';
import { monthlyByStore, storeBreakdown, storeInfoRows, storeProfiles } from '@/lib/queries';
import { delta, eok, man, pct, won } from '@/lib/format';
import StoreForm from './StoreForm';

export const metadata = { title: '매장 비교 · 마마치킨' };

const COLORS = ['#E5482B', '#2F5D9E', '#E59A2F', '#6B8F3A'];

export default async function StoresPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const showClosed = sp.closed === '1';
  const amt = await getAmount();
  const yesterday = addDays(todayKst(), -1);
  const monthStart = `${yesterday.slice(0, 7)}-01`;
  const prevEnd = addDays(monthStart, -1);
  const prevStart = `${prevEnd.slice(0, 7)}-01`;
  const [profiles, monthly, infoRows, curMonth, prevMonth] = await Promise.all([
    storeProfiles(), monthlyByStore(yesterday, 'all'), storeInfoRows(),
    storeBreakdown({ from: monthStart, to: yesterday }, 'all'), storeBreakdown({ from: prevStart, to: prevEnd }, 'all'),
  ]);
  const curDays = daysBetween(monthStart, yesterday);
  const prevDays = daysBetween(prevStart, prevEnd);
  const visible = profiles.filter((s) => showClosed || s.open);
  const months = [...new Set(monthly.map((r) => r.m))];

  const cards = visible.map((s, i) => {
    const cm = curMonth.find((r) => r.store_name === s.store_name);
    const pm = prevMonth.find((r) => r.store_name === s.store_name);
    const avg = cm ? cm.rev / curDays : 0;
    const pavg = pm ? pm.rev / prevDays : 0;
    return { ...s, cm, avg, pavg, d: delta(avg, pavg), color: s.open ? COLORS[i % COLORS.length] : '#8A817A' };
  });

  return (
    <>
      <div className="head">
        <div>
          <h1>매장 비교</h1>
          <div className="muted">매장별 규모·성장·채널 구성 · {amt.label} 기준 · 진행 중인 달은 일평균으로 비교 ({+yesterday.slice(5, 7)}월 {curDays}일 기준)</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <AmountSwitch value={amt.key} />
        <div className="seg" role="group" aria-label="폐점 매장">
          <Link scroll={false} className={showClosed ? '' : 'on'} href={withParams(sp, { closed: '' })}>운영 매장만</Link>
          <Link scroll={false} className={showClosed ? 'on' : ''} href={withParams(sp, { closed: '1' })}>폐점 매장 포함</Link>
        </div>
        </div>
      </div>

      <div className="grid3">
        {cards.map((s) => (
          <article key={s.store_name} className="card" style={s.open ? {} : { background: '#FAF8F5' }}>
            <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              {s.store_name} <span className={s.open ? 'tag on' : 'tag off'}>{s.open ? '운영' : '폐점'}</span>
            </h3>
            <div className="small muted">첫 매출 {s.first_day || '-'}{s.open ? '' : ` · 마지막 매출 ${s.last_day}`} · 영업일 {won(s.days)}일 · POS {s.codes.join(', ')}</div>
            {s.open ? (
              <>
                <div className="big">{won(s.avg)}원<span className="small muted" style={{ fontWeight: 500 }}> {+yesterday.slice(5, 7)}월 일평균</span></div>
                <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{+yesterday.slice(5, 7)}월 매출 ({curDays}일)</span><span>{won(s.cm?.rev || 0)}원</span></div>
                <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">일평균 · 지난달 대비</span><span className={s.d.cls}>{s.d.text} (지난달 {won(s.pavg)}원)</span></div>
              </>
            ) : (
              <div className="small muted">폐점 매장 — 기간을 골라 매출 현황에서 과거 실적을 볼 수 있습니다.</div>
            )}
            <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">누적 매출</span><span>{eok(s.life)}</span></div>
            {s.cm && (
              <>
                <div className="mix" aria-label="판매유형 비중">
                  <div style={{ width: `${pct(s.cm.delivery || 0, s.cm.rev)}%`, background: '#E5482B' }} />
                  <div style={{ width: `${pct(s.cm.dinein || 0, s.cm.rev)}%`, background: '#2F5D9E' }} />
                  <div style={{ width: `${pct(s.cm.takeout || 0, s.cm.rev)}%`, background: '#E59A2F' }} />
                </div>
                <div className="small muted">배달 {pct(s.cm.delivery || 0, s.cm.rev, 0)}% · 매장 {pct(s.cm.dinein || 0, s.cm.rev, 0)}% · 포장 {pct(s.cm.takeout || 0, s.cm.rev, 0)}% · 객단가 {won(s.cm.orders ? s.cm.rev / s.cm.orders : 0)}원</div>
              </>
            )}
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="ph"><h2>월별 매출 (만원)</h2><span className="small muted">최근 12개월 · 셀 아래 막대 = 매장 내 월별 크기 비교</span></div>
        <div className="scroll">
          <table>
            <thead><tr><th className="l">매장</th>{months.map((m) => <th key={m}>{+m.slice(5)}월</th>)}<th>합계</th></tr></thead>
            <tbody>
              {cards.map((s) => {
                const vals = months.map((m) => monthly.find((r) => r.m === m && r.store_name === s.store_name)?.rev || 0);
                const mx = Math.max(1, ...vals);
                return (
                  <tr key={s.store_name}>
                    <td className="l"><b>{s.store_name}</b></td>
                    {vals.map((v, i) => (
                      <td key={i} style={{ position: 'relative' }}>
                        {v ? man(v) : '—'}
                        {v > 0 && <span style={{ position: 'absolute', left: 6, right: 6, bottom: 4, height: 3, borderRadius: 2, background: s.color, opacity: 0.25 + (0.75 * v) / mx }} />}
                      </td>
                    ))}
                    <td><b>{man(vals.reduce((a, b) => a + b, 0))}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>매장 정보 관리</h2></div>
        <div className="small muted">POS 매장코드를 매장명에 연결합니다. 같은 매장이 POS 코드를 바꾼 경우 같은 매장명으로 등록하면 하나로 합쳐 집계됩니다. 수집 중 처음 보는 코드는 '미등록'으로 나타납니다.</div>
        <div className="scroll">
          <table>
            <thead><tr><th className="l">POS 코드</th><th className="l">데이터 기간</th><th className="l">매장명 · 상태 · 비고</th></tr></thead>
            <tbody>
              {infoRows.map((r) => (
                <tr key={r.store_code}>
                  <td className="l"><b>{r.store_code}</b> {r.status === '미등록' && <span className="tag warn">미등록</span>}</td>
                  <td className="l small">{r.first_day || '-'} ~ {r.last_day === yesterday ? '현재' : r.last_day || '-'}</td>
                  <td className="l"><StoreForm row={r} /></td>
                </tr>
              ))}
              <tr>
                <td className="l small muted" colSpan={2}>새 매장 코드 추가</td>
                <td className="l"><StoreForm row={null} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
