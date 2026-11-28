'use client';

import { useActionState } from 'react';
import { sendFeedback, updateFeedback } from './actions';

function Msg({ state }) {
  if (state?.error) return <div className="error" role="alert">{state.error}</div>;
  if (state?.ok) return <div className="ok" role="status">{state.ok}</div>;
  return null;
}

/** 개선 요청 보내기 */
export function FeedbackForm({ categories, pages }) {
  const [state, action, pending] = useActionState(sendFeedback, null);
  return (
    <form action={action} className="form" key={state?.ok ? state.at : 'f'}>
      <div className="grid2" style={{ gap: 10 }}>
        <label>종류
          <select id="fb-category" name="category" required defaultValue="">
            <option value="" disabled>선택</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>관련 화면 <span className="small muted" style={{ fontWeight: 400 }}>선택</span>
          <select id="fb-page" name="page" defaultValue="">
            <option value="">선택 안 함</option>
            {pages.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label>제목<input id="fb-title" name="title" maxLength={100} required placeholder="예: 주문 리포트에 배달 주소 지역별 집계 추가" /></label>
      <label>내용
        <textarea id="fb-body" name="body" rows={6} maxLength={3000} required style={{ padding: 10, minHeight: 140, fontFamily: 'inherit' }}
          placeholder={'무엇이 불편한지, 어떻게 바뀌면 좋을지 적어 주세요.\n오류라면 어느 화면에서 무엇을 눌렀을 때 생겼는지 적어 주시면 빨리 고칠 수 있습니다.'} />
      </label>
      <Msg state={state} />
      <button className="btn primary" type="submit" disabled={pending}>{pending ? '보내는 중…' : '개선 요청 보내기'}</button>
    </form>
  );
}

/** 슈퍼관리자: 상태·답변 변경 */
export function FeedbackAdmin({ item, statuses }) {
  const [state, action, pending] = useActionState(updateFeedback, null);
  return (
    <form action={action} className="form" style={{ gap: 8 }}>
      <input type="hidden" name="id" value={item.id} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ flex: '0 0 140px' }}>상태
          <select id={`fb-status-${item.id}`} name="status" defaultValue={item.status}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ flex: '1 1 260px' }}>답변
          <input id={`fb-reply-${item.id}`} name="reply" defaultValue={item.reply || ''} maxLength={2000} placeholder="요청자에게 보이는 답변 (처리 내용이나 일정)" />
        </label>
        <button className="btn" type="submit" disabled={pending}>{pending ? '저장 중…' : '저장'}</button>
      </div>
      <Msg state={state} />
    </form>
  );
}
