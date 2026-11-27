'use client';

import { useActionState } from 'react';
import { deleteStockEntry } from '../inv-actions';

/** 잘못 입력한 실사·입고 삭제 */
export default function HistoryDelete({ kind, id }) {
  const [state, action, pending] = useActionState(deleteStockEntry, null);
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm('이 입력을 삭제할까요? 추정 재고가 다시 계산됩니다.')) e.preventDefault(); }}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button className="btn small" type="submit" disabled={pending} aria-label="입력 삭제">삭제</button>
      {state?.error && <span className="small down" role="alert"> {state.error}</span>}
    </form>
  );
}
