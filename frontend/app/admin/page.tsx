'use client';

import { useEffect, useState } from 'react';
import { clearAdminKey, getAdminKey, setAdminKey } from '@/lib/adminApi';
import MenuAdmin from './MenuAdmin';
import BannerAdmin from './BannerAdmin';
import PostAdmin from './PostAdmin';
import StoreAdmin from './StoreAdmin';
import styles from './admin.module.css';

const TABS = [
  { id: 'menu', label: '🍗 메뉴 관리' },
  { id: 'banner', label: '🖼️ 홈 배너 관리' },
  { id: 'notice', label: '✒️ 새소식 관리' },
  { id: 'event', label: '🎉 이벤트 관리' },
  { id: 'store', label: '📍 매장 관리' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabId>('menu');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setAuthed(!!getAdminKey());
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
      setAdminKey(data.key);
      setAuthed(true);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    }
  };

  const logout = () => {
    clearAdminKey();
    setAuthed(false);
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
        <button type="button" className={styles.logout} onClick={logout}>
          로그아웃
        </button>
      </div>

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
    </div>
  );
}
