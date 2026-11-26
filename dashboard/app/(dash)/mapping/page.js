import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { withParams } from '@/lib/period';
import { MAP_FILTER_NAMES, mappingList, mappingStats, webMenuItems } from '@/lib/queries';
import { won } from '@/lib/format';
import MappingForm from './MappingForm';

export const metadata = { title: '메뉴 매핑 관리 · 마마치킨' };

const CHANNEL = { BM: '배민', CP: '쿠팡', YG: '요기요', BDP: 'BDP', SMTDP: '대행' };
const keyOf = (r) => Buffer.from(JSON.stringify([r.src, r.menu_group, r.item_text])).toString('base64url');

export default async function MappingPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const filter = MAP_FILTER_NAMES.some(([k]) => k === sp.f) ? sp.f : 'unlinked';
  const search = String(sp.q || '').slice(0, 50);
  const page = Math.max(1, Number(sp.page) || 1);
  const [stats, rows, webMenu] = await Promise.all([mappingStats(), mappingList({ filter, search, page }), webMenuItems()]);
  const total = rows[0]?.total || 0;
  const selected = rows.find((r) => keyOf(r) === sp.sel) || rows[0];
  const channels = (r) => (r.src === 'POS' ? '매장' : (r.codes || '').split(',').map((c) => CHANNEL[c] || c).join(' · '));

  return (
    <>
      <div className="head">
        <div>
          <h1>메뉴 매핑 관리</h1>
          <div className="muted">배달앱·POS의 원래 메뉴 표기를 홈페이지 정상 메뉴에 연결합니다. 여기서 고친 내용은 &lsquo;수동&rsquo;으로 저장되어 자동 매핑이 덮어쓰지 않습니다.</div>
        </div>
      </div>

      <div className="grid4" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        {[['원래 표기', stats.total, '배달앱·POS 메뉴명 종류'], ['홈페이지 메뉴 연결', stats.web, '메뉴 id로 연결'], ['표준명만', stats.std_only, '반반·버거·음료 등'],
          ['옵션·요청', stats.options, '매출 집계 제외'], ['수동 수정', stats.manual, `최근 7일 추가 ${stats.recent}`]].map(([l, v, s]) => (
          <div key={l} className="card" style={{ padding: '14px 16px' }}>
            <span className="small muted">{l}</span><b className="big">{won(v)}</b><span className="small muted">{s}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 16, alignItems: 'start' }} className="map-grid">
        <section className="panel">
          <div className="tabs" role="group" aria-label="보기">
            {MAP_FILTER_NAMES.map(([k, l]) => <Link key={k} scroll={false} className={k === filter ? 'on' : ''} href={withParams({ q: search }, { f: k })}>{l}</Link>)}
          </div>
          <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="hidden" name="f" value={filter} />
            <input type="search" name="q" defaultValue={search} placeholder="원래 표기 또는 표준 메뉴 검색" aria-label="메뉴 검색"
              style={{ flex: '1 1 220px', minHeight: 40, border: '1px solid #DDD6CD', borderRadius: 8, padding: '0 12px' }} />
            <button className="btn" type="submit">검색</button>
          </form>
          {rows.length === 0 ? <div className="empty">해당하는 메뉴가 없습니다.</div> : (
            <div className="scroll">
              <table>
                <thead><tr><th className="l">원래 표기</th><th className="l">채널</th><th>판매 행</th><th className="l">표준 메뉴</th><th className="l">상태</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const sel = selected && keyOf(r) === keyOf(selected);
                    return (
                      <tr key={keyOf(r)} style={sel ? { background: '#FFF4EF' } : undefined}>
                        <td className="l" style={{ whiteSpace: 'normal', maxWidth: 280 }}>
                          <Link scroll={false} href={withParams(sp, { sel: keyOf(r) })} style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>{r.item_text}</Link>
                          {r.src === 'POS' && <div className="small muted">POS 분류: {r.menu_group || '-'}</div>}
                        </td>
                        <td className="l small">{channels(r)}</td>
                        <td>{won(r.n)}</td>
                        <td className="l" style={{ whiteSpace: 'normal' }}>
                          <span className="muted">→</span> {r.std_name}{' '}
                          {r.menu_item_id ? <span className="tag web">#{r.menu_item_id}</span> : r.is_option ? <span className="tag">옵션</span> : <span className="tag">표준명</span>}
                          <div className="small muted">{r.category}</div>
                        </td>
                        <td className="l"><span className={r.source === 'manual' ? 'tag warn' : 'tag'}>{r.source === 'manual' ? '수동' : '자동'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > 50 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              {page > 1 && <Link className="btn small" href={withParams(sp, { page: page - 1, sel: '' })}>이전</Link>}
              <span className="small muted">{page} / {Math.ceil(total / 50)} 페이지 · {won(total)}건</span>
              {page * 50 < total && <Link className="btn small" href={withParams(sp, { page: page + 1, sel: '' })}>다음</Link>}
            </div>
          )}
        </section>

        <section className="panel" aria-label="매핑 수정">
          <div className="ph"><h2>매핑 수정</h2></div>
          {selected ? <MappingForm row={selected} webMenu={webMenu} /> : <div className="empty">왼쪽 목록에서 메뉴를 고르세요.</div>}
        </section>
      </div>
    </>
  );
}
