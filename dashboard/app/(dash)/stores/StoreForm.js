'use client';

import { useActionState } from 'react';
import { saveStore } from '../actions';

/** 매장 정보 한 줄 수정 / 새 코드 추가 */
export default function StoreForm({ row }) {
  const [state, action, pending] = useActionState(saveStore, null);
  const isNew = !row?.store_name;
  return (
    <form action={action} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {row?.store_code
        ? <input type="hidden" name="store_code" value={row.store_code} />
        : <input name="store_code" placeholder="POS 코드" aria-label="POS 매장코드" required inputMode="numeric" style={inp(110)} />}
      <input name="store_name" defaultValue={row?.store_name || ''} placeholder="매장명" aria-label="매장명" required style={inp(130)} />
      <select name="status" defaultValue={row?.status === '폐점' ? '폐점' : '운영'} aria-label="상태" style={inp(90)}>
        <option>운영</option><option>폐점</option>
      </select>
      <input name="note" defaultValue={row?.note || ''} placeholder="비고" aria-label="비고" style={{ ...inp(220), flex: '1 1 160px' }} />
      <button className="btn small primary" type="submit" disabled={pending}>{isNew ? '등록' : '저장'}</button>
      {state?.error && <span className="small down" role="alert">{state.error}</span>}
      {state?.ok && <span className="small up" role="status">{state.ok}</span>}
    </form>
  );
}

const inp = (w) => ({ minHeight: 36, width: w, border: '1px solid #DDD6CD', borderRadius: 8, padding: '0 10px', background: '#fff' });
