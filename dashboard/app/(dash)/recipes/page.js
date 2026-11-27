import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { withParams } from '@/lib/period';
import { ingredients, recipeLines, recipeMenus } from '@/lib/inventory';
import { won } from '@/lib/format';
import { qtyFmt } from '@/lib/stock';
import IngredientForm from './IngredientForm';
import RecipeForm from './RecipeForm';

export const metadata = { title: '레시피·식자재 · 마마치킨' };

const keyOf = (m) => Buffer.from(JSON.stringify([m.category, m.std_name])).toString('base64url');
const FILTERS = [['todo', '레시피 미등록'], ['done', '등록됨'], ['all', '전체']];

export default async function RecipesPage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.f) ? sp.f : 'todo';
  const search = String(sp.q || '').trim().slice(0, 40);
  const [ings, menus] = await Promise.all([ingredients(), recipeMenus()]);
  const list = menus
    .filter((m) => (filter === 'todo' ? !m.lines : filter === 'done' ? m.lines : true))
    .filter((m) => !search || m.std_name.includes(search) || m.category.includes(search));
  const selected = menus.find((m) => keyOf(m) === sp.m) || list[0] || null;
  const lines = selected ? await recipeLines(selected.category, selected.std_name) : [];
  const editIng = ings.find((g) => String(g.id) === sp.ing) || null;
  const done = menus.filter((m) => m.lines).length;
  const soldQty = menus.reduce((a, m) => a + m.qty, 0);
  const coveredQty = menus.filter((m) => m.lines).reduce((a, m) => a + m.qty, 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>레시피·식자재</h1>
          <div className="muted">식자재를 등록하고, 표준 메뉴 1개(옵션 포함)에 들어가는 양을 입력하면 주문 데이터로 소모량과 재고를 계산합니다.</div>
        </div>
      </div>

      <div className="grid4">
        <div className="card"><span className="label">식자재</span><b className="big">{won(ings.filter((g) => g.active).length)}개</b><span className="small muted">사용 중지 {ings.filter((g) => !g.active).length}개</span></div>
        <div className="card"><span className="label">레시피 등록 메뉴</span><b className="big">{won(done)} / {won(menus.length)}</b><span className="small muted">최근 90일 판매 메뉴·옵션 기준</span></div>
        <div className="card"><span className="label">판매 수량 커버율</span><b className="big">{soldQty ? Math.round((coveredQty / soldQty) * 100) : 0}%</b><span className="small muted">레시피가 있는 메뉴의 판매 수량 비율</span></div>
        <div className="card"><span className="label">입력 순서</span><span className="small">① 식자재 등록 → ② 판매 많은 메뉴부터 레시피 → ③ 재고 화면에서 실사·안전재고</span></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(320px, 2fr)', gap: 16, alignItems: 'start' }} className="map-grid">
        <section className="panel">
          <div className="ph"><h2>메뉴별 레시피</h2><span className="small muted">판매 많은 순 · 최근 90일 수량</span></div>
          <div className="tabs" role="group" aria-label="보기">
            {FILTERS.map(([k, l]) => <Link key={k} scroll={false} className={k === filter ? 'on' : ''} href={withParams({ q: search }, { f: k })}>{l}</Link>)}
          </div>
          <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="hidden" name="f" value={filter} />
            <input type="search" name="q" defaultValue={search} placeholder="메뉴·분류 검색" aria-label="메뉴 검색"
              style={{ flex: '1 1 200px', minHeight: 40, border: '1px solid #DDD6CD', borderRadius: 8, padding: '0 12px' }} />
            <button className="btn" type="submit">검색</button>
          </form>
          {list.length === 0 ? <div className="empty">해당하는 메뉴가 없습니다.</div> : (
            <div className="scroll" style={{ maxHeight: 640, overflowY: 'auto' }}>
              <table>
                <thead><tr><th className="l">표준 메뉴</th><th className="l">분류</th><th>90일 수량</th><th className="l">레시피</th></tr></thead>
                <tbody>
                  {list.map((m) => {
                    const on = selected && keyOf(m) === keyOf(selected);
                    return (
                      <tr key={keyOf(m)} style={on ? { background: '#FFF4EF' } : undefined}>
                        <td className="l" style={{ whiteSpace: 'normal' }}>
                          <Link scroll={false} href={withParams(sp, { m: keyOf(m) })} style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>{m.std_name}</Link>
                        </td>
                        <td className="l small">{m.category}</td>
                        <td>{won(m.qty)}</td>
                        <td className="l">{m.lines ? <span className="tag on">{m.lines}줄</span> : <span className="tag warn">미등록</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="panel" aria-label="레시피 입력">
            <div className="ph"><h2>레시피 입력</h2></div>
            {!selected ? <div className="empty">왼쪽에서 메뉴를 고르세요.</div>
              : ings.filter((g) => g.active).length === 0 ? <div className="notice">먼저 아래에서 식자재를 등록하세요.</div>
                : <RecipeForm key={keyOf(selected)} menu={selected} lines={lines} ingredients={ings.filter((g) => g.active)} copyFrom={menus.filter((m) => m.lines && keyOf(m) !== keyOf(selected)).map((m) => ({ key: keyOf(m), label: `${m.std_name} · ${m.category}` }))} />}
          </section>

          <section className="panel" aria-label="식자재">
            <div className="ph"><h2>식자재</h2>{editIng && <Link className="btn small" scroll={false} href={withParams(sp, { ing: '' })}>새로 추가</Link>}</div>
            <IngredientForm key={editIng?.id || 'new'} row={editIng} />
            {ings.length > 0 && (
              <div className="scroll">
                <table>
                  <thead><tr><th className="l">이름</th><th className="l">단위</th><th className="l">발주 단위</th><th>레시피</th><th /></tr></thead>
                  <tbody>
                    {ings.map((g) => (
                      <tr key={g.id} style={g.active ? undefined : { color: 'var(--muted)' }}>
                        <td className="l"><b>{g.name}</b>{!g.active && <span className="tag off" style={{ marginLeft: 6 }}>사용 중지</span>}</td>
                        <td className="l">{g.unit}</td>
                        <td className="l small">{g.pack_size ? `1${g.pack_name || '팩'} = ${qtyFmt(g.pack_size)}${g.unit}` : '-'}</td>
                        <td>{g.recipes}</td>
                        <td><Link className="btn small" scroll={false} href={withParams(sp, { ing: g.id })}>수정</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
