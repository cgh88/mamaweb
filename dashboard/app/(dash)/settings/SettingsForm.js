'use client';

import { startTransition, useActionState, useRef } from 'react';
import { saveSettings, testSettings } from './actions';

function Msg({ state }) {
  if (state?.error) return <div className="error" role="alert">{state.error}</div>;
  if (state?.ok) return <div className="ok" role="status">{state.ok}</div>;
  return null;
}

const fmt = (ts) => (ts ? new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** 설정 그룹 하나: 입력 → 연결 테스트 → 비밀번호 확인 후 저장 */
export default function SettingsForm({ group, items, current }) {
  const [sState, sAction, sPending] = useActionState(saveSettings, null);
  const [tState, tAction, tPending] = useActionState(testSettings, null);
  const formRef = useRef(null);
  return (
    <form ref={formRef} action={sAction} className="form" key={sState?.ok ? sState.at : 'f'} autoComplete="off">
      <input type="hidden" name="group" value={group.id} />
      {items.map((it) => {
        const cur = current[it.key];
        return (
          <div key={it.key} className="setting">
            <label htmlFor={`v_${it.key}`}>
              <span><b>{it.label}</b> <code className="small muted">{it.key}</code></span>
              {it.secret ? (
                cur?.set ? <span className="tag on">저장됨 ••••{cur.hint}</span> : <span className="tag off">미설정 · 서버 .env 값 사용</span>
              ) : (
                cur?.set ? <span className="tag on">저장됨</span> : <span className="tag off">미설정 · 기본값/.env 사용</span>
              )}
            </label>
            {it.multiline ? (
              <textarea id={`v_${it.key}`} name={`v_${it.key}`} rows={5} defaultValue={cur?.value || ''} placeholder={it.placeholder} style={{ padding: 10, minHeight: 120, fontFamily: 'inherit' }} />
            ) : (
              <input
                id={`v_${it.key}`} name={`v_${it.key}`} type={it.secret ? 'password' : 'text'} autoComplete={it.secret ? 'new-password' : 'off'}
                defaultValue={it.secret ? '' : cur?.value || ''} spellCheck={false}
                placeholder={it.secret ? (cur?.set ? '바꿀 때만 입력 (빈칸이면 기존 값 유지)' : '값을 입력하세요') : it.placeholder || ''}
              />
            )}
            <span className="small muted">
              {it.help}
              {cur?.set && ` · ${fmt(cur.updated_at)} ${cur.updated_by || ''} 저장`}
            </span>
            {it.secret && cur?.set && (
              <label className="check small"><input type="checkbox" name={`clear_${it.key}`} value="1" /> 저장된 값 삭제 (서버 .env 값으로 되돌림)</label>
            )}
          </div>
        );
      })}
      <div className="setting-actions">
        <label style={{ flex: '1 1 220px' }}>현재 비밀번호 <span className="small muted" style={{ fontWeight: 400 }}>저장할 때 확인</span>
          <input type="password" name="password" autoComplete="current-password" />
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {group.test && (
            <button className="btn" type="button" disabled={tPending}
              onClick={() => { const fd = new FormData(formRef.current); fd.delete('password'); startTransition(() => tAction(fd)); }}>
              {tPending ? '확인 중…' : '연결 테스트'}
            </button>
          )}
          <button className="btn primary" type="submit" disabled={sPending}>{sPending ? '저장 중…' : '저장'}</button>
        </div>
      </div>
      <Msg state={tState} />
      <Msg state={sState} />
    </form>
  );
}
