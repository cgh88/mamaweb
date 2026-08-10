'use client';

import { useEffect, useState } from 'react';
import { adminFetch, clearAdminToken, getAdminToken, setAdminToken } from '@/lib/adminApi';
import MenuAdmin from './MenuAdmin';
import BannerAdmin from './BannerAdmin';
import PostAdmin from './PostAdmin';
import StoreAdmin from './StoreAdmin';
import SecurityAdmin from './SecurityAdmin';
import styles from './admin.module.css';

const TABS = [
  { id: 'menu', label: '🍗 메뉴 관리' },
  { id: 'banner', label: '🖼️ 홈 배너 관리' },
  { id: 'notice', label: '✒️ 새소식 관리' },
  { id: 'event', label: '🎉 이벤트 관리' },
  { id: 'store', label: '📍 매장 관리' },
  { id: 'security', label: '⚙️ 보안 설정' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabId>('menu');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [defaultPw, setDefaultPw] = useState(false);
  const [pwModal, setPwModal] = useState(false);

  useEffect(() => {
    setAuthed(!!getAdminToken());
    setDefaultPw(sessionStorage.getItem('mama_admin_default_pw') === '1');
    setReady(true);
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '로그인 실패');
      setAdminToken(data.token);
      setDefaultPw(!!data.isDefaultPassword);
      if (data.isDefaultPassword) sessionStorage.setItem('mama_admin_default_pw', '1');
      else sessionStorage.removeItem('mama_admin_default_pw');
      setAuthed(true);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    }
  };

  const logout = async () => {
    try {
      await adminFetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // 세션이 이미 만료된 경우도 로그아웃 처리
    }
    clearAdminToken();
    setAuthed(false);
    setDefaultPw(false);
  };

  if (!ready) return null;

  if (!authed) {
    return (
      <div className={styles.wrap}>
        <div className={styles.loginCard}>
          <h1>🔐 관리자 로그인</h1>
          <p>마마치킨 관리자 페이지입니다.</p>
          <form onSubmit={login}>
            <input
              type="password"
              placeholder="관리자 비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary">
              로그인
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <h1>
          <span>MAMA</span> 관리자
        </h1>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button type="button" className={styles.smallBtn} onClick={() => setPwModal(true)}>
            🔒 비밀번호 변경
          </button>
          <button type="button" className={styles.logout} onClick={logout}>
            로그아웃
          </button>
        </div>
      </div>

      {defaultPw && (
        <div className={styles.warnBanner}>
          ⚠️ 기본 비밀번호를 사용 중입니다. 보안을 위해 지금 바로{' '}
          <button type="button" onClick={() => setPwModal(true)}>
            비밀번호를 변경
          </button>
          해주세요.
        </div>
      )}

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chip ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'menu' && <MenuAdmin />}
      {tab === 'banner' && <BannerAdmin />}
      {tab === 'notice' && <PostAdmin type="notice" />}
      {tab === 'event' && <PostAdmin type="event" />}
      {tab === 'store' && <StoreAdmin />}
      {tab === 'security' && <SecurityAdmin />}

      {pwModal && (
        <PasswordModal
          onClose={() => setPwModal(false)}
          onChanged={() => {
            setPwModal(false);
            setDefaultPw(false);
            sessionStorage.removeItem('mama_admin_default_pw');
          }}
        />
      )}
    </div>
  );
}

function PasswordModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setSaving(true);
    try {
      const data = await adminFetch('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      // 변경 성공 시 기존 세션은 전부 무효화되고 새 토큰이 발급됨
      setAdminToken(data.token);
      setDone(true);
      setTimeout(onChanged, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '변경 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ padding: '36px 32px' }}>
          <h2 style={{ fontWeight: 800, marginBottom: 6 }}>🔒 비밀번호 변경</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--ink-mute)', marginBottom: 20 }}>
            8자 이상, 영문과 숫자를 모두 포함해야 합니다.
          </p>

          {done ? (
            <p style={{ color: 'green', fontWeight: 700 }}>
              ✅ 비밀번호가 변경되었습니다.
            </p>
          ) : (
            <form className={styles.formGrid} onSubmit={submit}>
              <label>
                현재 비밀번호
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                새 비밀번호
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
              <label>
                새 비밀번호 확인
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.formActions}>
                <button type="button" className={styles.smallBtn} onClick={onClose}>
                  취소
                </button>
                <button
                  type="submit"
                  className={`${styles.smallBtn} ${styles.primarySmall}`}
                  disabled={saving}
                >
                  {saving ? '변경 중...' : '변경'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
