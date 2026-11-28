'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { login } from './actions';

// 아이디 저장: 이 브라우저에만 저장 (비밀번호는 저장하지 않음)
const SAVED_ID = 'mama_dash_saved_id';
const readSaved = () => { try { return localStorage.getItem(SAVED_ID) || ''; } catch { return ''; } };
const writeSaved = (v) => { try { if (v) localStorage.setItem(SAVED_ID, v); else localStorage.removeItem(SAVED_ID); } catch { /* 저장 불가 브라우저 */ } };

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  const [remember, setRemember] = useState(false);
  const idRef = useRef(null);
  const pwRef = useRef(null);

  useEffect(() => {
    const saved = readSaved();
    if (saved && idRef.current && !idRef.current.value) {
      idRef.current.value = saved;
      setRemember(true);
      pwRef.current?.focus();
    }
  }, []);

  return (
    <form action={action} className="form" onSubmit={() => writeSaved(remember ? idRef.current?.value.trim() : '')}>
      {state?.error && <div className="error" role="alert">{state.error}</div>}
      <label>
        아이디
        <input ref={idRef} name="username" autoComplete="username" required defaultValue={state?.username || ''} autoFocus />
      </label>
      <label>
        비밀번호
        <input ref={pwRef} name="password" type="password" autoComplete="current-password" required />
      </label>
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => { setRemember(e.target.checked); if (!e.target.checked) writeSaved(''); }} />
        아이디 저장
      </label>
      <button className="btn primary" type="submit" disabled={pending} style={{ minHeight: 46 }}>
        {pending ? '확인 중…' : '로그인'}
      </button>
    </form>
  );
}
