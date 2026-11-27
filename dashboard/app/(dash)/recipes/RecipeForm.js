'use client';

import { useActionState, useState } from 'react';
import { saveRecipe } from '../inv-actions';

const blank = () => ({ id: Math.random().toString(36).slice(2), ingredient_id: '', qty: '' });

/** 메뉴 1개 레시피: 식자재 + 수량 줄 편집 */
export default function RecipeForm({ menu, lines, ingredients, copyFrom }) {
  const [state, action, pending] = useActionState(saveRecipe, null);
  const [rows, setRows] = useState(() => (lines.length ? lines.map((l) => ({ ...blank(), ingredient_id: String(l.ingredient_id), qty: String(l.qty) })) : [blank()]));
  const unitOf = (id) => ingredients.find((g) => String(g.id) === String(id))?.unit || '';
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="form" key={`${menu.category}|${menu.std_name}`}>
      <div className="ins">
        <span className="small muted">{menu.category} · 최근 90일 {Number(menu.qty).toLocaleString('ko-KR')}개 판매</span>
        <b>{menu.std_name}</b>
        <span className="small muted">이 메뉴 1개(옵션이면 옵션 1회)에 들어가는 양을 입력하세요.</span>
      </div>
      <form action={action} className="form">
        <input type="hidden" name="category" value={menu.category} />
        <input type="hidden" name="std_name" value={menu.std_name} />
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 8, alignItems: 'center' }}>
            <select name="ingredient_id" value={r.ingredient_id} onChange={(e) => set(i, { ingredient_id: e.target.value })} aria-label={`${i + 1}번째 식자재`}>
              <option value="">식자재 선택</option>
              {ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input name="qty" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} inputMode="decimal" placeholder="수량" aria-label={`${i + 1}번째 수량`} style={{ width: '100%' }} />
              <span className="small muted" style={{ minWidth: 24 }}>{unitOf(r.ingredient_id)}</span>
            </div>
            <button type="button" className="btn small" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [blank()]))} aria-label={`${i + 1}번째 줄 삭제`}>삭제</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setRows((x) => [...x, blank()])}>+ 식자재 줄 추가</button>
        {state?.error && <div className="error" role="alert">{state.error}</div>}
        {state?.ok && <div className="ok" role="status">{state.ok}</div>}
        <button className="btn primary" type="submit" disabled={pending}>{pending ? '저장 중…' : '레시피 저장'}</button>
      </form>
      {copyFrom.length > 0 && (
        <label className="small muted" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>다른 메뉴 레시피 불러오기 (저장 전 수정 가능)
          <select defaultValue="" onChange={async (e) => {
            if (!e.target.value) return;
            const res = await fetch(`/recipes/lines?m=${encodeURIComponent(e.target.value)}`);
            if (res.ok) {
              const data = await res.json();
              setRows(data.length ? data.map((l) => ({ ...blank(), ingredient_id: String(l.ingredient_id), qty: String(l.qty) })) : [blank()]);
            }
            e.target.value = '';
          }}>
            <option value="">메뉴 선택</option>
            {copyFrom.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
