'use client';

import { useActionState } from 'react';
import { saveIngredient } from '../inv-actions';

/** 식자재 추가·수정 */
export default function IngredientForm({ row }) {
  const [state, action, pending] = useActionState(saveIngredient, null);
  return (
    <form action={action} className="form">
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid2" style={{ gap: 10 }}>
        <label>이름<input name="name" defaultValue={row?.name || ''} placeholder="예: 생닭(10호), 순살 정육, 마마양념소스" required maxLength={40} /></label>
        <label>기본 단위 <span className="small muted" style={{ fontWeight: 400 }}>레시피·재고 입력 단위</span>
          <input name="unit" defaultValue={row?.unit || ''} placeholder="g, ml, 개, 마리" required maxLength={10} list="unit-list" />
        </label>
      </div>
      <datalist id="unit-list"><option value="g" /><option value="ml" /><option value="개" /><option value="마리" /><option value="봉" /></datalist>
      <div className="grid2" style={{ gap: 10 }}>
        <label>발주 단위 이름 <span className="small muted" style={{ fontWeight: 400 }}>선택</span><input name="pack_name" defaultValue={row?.pack_name || ''} placeholder="박스, 봉" maxLength={10} /></label>
        <label>발주 단위 1개 = 기본 단위<input name="pack_size" defaultValue={row?.pack_size ?? ''} placeholder="예: 10000" inputMode="decimal" /></label>
      </div>
      {row && (
        <label>상태
          <select name="active" defaultValue={row.active ? '1' : '0'}><option value="1">사용</option><option value="0">사용 중지 (재고 화면에서 숨김)</option></select>
        </label>
      )}
      {state?.error && <div className="error" role="alert">{state.error}</div>}
      {state?.ok && <div className="ok" role="status">{state.ok}</div>}
      <button className="btn primary" type="submit" disabled={pending}>{pending ? '저장 중…' : row ? `${row.name} 저장` : '식자재 추가'}</button>
    </form>
  );
}
