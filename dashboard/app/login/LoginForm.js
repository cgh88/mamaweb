'use client';

import { useActionState } from 'react';
import { login } from './actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="form">
      {state?.error && <div className="error" role="alert">{state.error}</div>}
      <label>
        아이디
        <input name="username" autoComplete="username" required defaultValue={state?.username || ''} autoFocus />
      </label>
      <label>
        비밀번호
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="btn primary" type="submit" disabled={pending} style={{ minHeight: 46 }}>
        {pending ? '확인 중…' : '로그인'}
      </button>
    </form>
  );
}
