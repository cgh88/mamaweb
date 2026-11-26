'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { changePassword } from '@/app/login/actions';

export default function PasswordForm({ first }) {
  const [state, action, pending] = useActionState(changePassword, null);
  if (state?.ok) {
    return (
      <div className="form">
        <div className="ok" role="status">{state.ok} 다른 기기의 로그인은 모두 종료됐습니다.</div>
        <Link className="btn primary" href="/">대시보드로 이동</Link>
      </div>
    );
  }
  return (
    <form action={action} className="form">
      {first && <div className="notice">처음 로그인했습니다. 임시 비밀번호를 새 비밀번호로 바꿔야 대시보드를 사용할 수 있습니다.</div>}
      {state?.error && <div className="error" role="alert">{state.error}</div>}
      <label>현재 비밀번호<input name="current" type="password" autoComplete="current-password" required /></label>
      <label>새 비밀번호<input name="next" type="password" autoComplete="new-password" required minLength={10} /></label>
      <label>새 비밀번호 확인<input name="confirm" type="password" autoComplete="new-password" required minLength={10} /></label>
      <div className="small muted">10자 이상, 영문과 숫자를 모두 포함하세요.</div>
      <button className="btn primary" type="submit" disabled={pending}>{pending ? '변경 중…' : '비밀번호 변경'}</button>
    </form>
  );
}
