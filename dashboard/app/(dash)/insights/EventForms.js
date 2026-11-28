'use client';

import { useActionState } from 'react';
import { addEvent, deleteEvent } from './actions';

function Msg({ state }) {
  if (state?.error) return <div className="error" role="alert">{state.error}</div>;
  if (state?.ok) return <div className="ok" role="status">{state.ok}</div>;
  return null;
}

/** 매장 이벤트 등록 */
export function EventForm({ categories, stores, today }) {
  const [state, action, pending] = useActionState(addEvent, null);
  return (
    <form action={action} className="form" key={state?.at || 0}>
      <div className="grid2" style={{ gap: 10 }}>
        <label>시작일<input type="date" name="date_from" defaultValue={today} required /></label>
        <label>종료일 <span className="small muted" style={{ fontWeight: 400 }}>하루면 비워 두세요</span><input type="date" name="date_to" /></label>
      </div>
      <div className="grid2" style={{ gap: 10 }}>
        <label>분류
          <select name="category" required defaultValue="">
            <option value="" disabled>선택</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>매장
          <select name="store" defaultValue="">
            <option value="">전 매장</option>
            {stores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label>이벤트 이름<input name="title" maxLength={80} required placeholder="예: 고려대 기말고사, 한국 vs 일본 축구, 배민 3천원 할인" /></label>
      <label>메모 <span className="small muted" style={{ fontWeight: 400 }}>선택</span><input name="note" maxLength={200} placeholder="시간·대상 등" /></label>
      <Msg state={state} />
      <button className="btn primary" type="submit" disabled={pending}>{pending ? '저장 중…' : '이벤트 등록'}</button>
    </form>
  );
}

export function EventDelete({ id, title }) {
  const [state, action, pending] = useActionState(deleteEvent, null);
  return (
    <form action={action} style={{ display: 'inline' }} onSubmit={(e) => { if (!window.confirm(`'${title}' 이벤트를 삭제할까요?`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn small" type="submit" disabled={pending} aria-label={`${title} 삭제`}>삭제</button>
      {state?.error && <span className="small" role="alert"> {state.error}</span>}
    </form>
  );
}
