'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import styles from './admin.module.css';

/** 관리자 접속 허용 IP 관리 (auth.json의 allowedIps에 저장됨) */
export default function SecurityAdmin() {
  const [ips, setIps] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [currentIp, setCurrentIp] = useState('');
  const [newIp, setNewIp] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/allowed-ips')
      .then((d) => {
        setIps(d.allowedIps);
        setSaved(d.allowedIps);
        setCurrentIp(d.currentIp);
      })
      .catch((e) => setError(e.message));
  }, []);

  const dirty = JSON.stringify(ips) !== JSON.stringify(saved);

  const addIp = () => {
    const v = newIp.trim();
    if (!v) return;
    if (ips.includes(v)) {
      setError('이미 목록에 있는 IP입니다.');
      return;
    }
    setError('');
    setMessage('');
    setIps([...ips, v]);
    setNewIp('');
  };

  const removeIp = (ip: string) => {
    setIps(ips.filter((x) => x !== ip));
    setMessage('');
  };

  const saveAll = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const d = await adminFetch('/api/admin/allowed-ips', {
        method: 'PUT',
        body: JSON.stringify({ allowedIps: ips }),
      });
      setIps(d.allowedIps);
      setSaved(d.allowedIps);
      setCurrentIp(d.currentIp);
      setMessage(
        d.selfAdded
          ? `저장되었습니다. 접속이 잠기지 않도록 현재 IP(${d.currentIp})가 자동으로 추가되었습니다.`
          : '저장되었습니다.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <p style={{ color: 'var(--ink-mute)', fontSize: '0.92rem' }}>
          등록된 IP에서만 관리자 페이지(로그인 포함)에 접속할 수 있습니다.{' '}
          <b>목록이 비어 있으면 모든 IP에서 접속 가능</b>합니다.
        </p>
      </div>

      <div
        style={{
          background: 'var(--paper)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          padding: '22px 24px',
          maxWidth: 560,
        }}
      >
        <p style={{ fontSize: '0.92rem', marginBottom: 16 }}>
          현재 내 IP: <b style={{ color: 'var(--brand)' }}>{currentIp || '확인 중...'}</b>
          {currentIp && !ips.includes(currentIp) && ips.length > 0 && (
            <span style={{ color: 'var(--brand)', display: 'block', fontSize: '0.82rem' }}>
              ⚠️ 현재 IP가 목록에 없습니다. 저장 시 잠금 방지를 위해 자동으로 추가됩니다.
            </span>
          )}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="허용할 IP 입력 (예: 211.234.1.2)"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addIp();
              }
            }}
            style={{
              flex: 1,
              height: 44,
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 14px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            className={`${styles.smallBtn} ${styles.primarySmall}`}
            onClick={addIp}
          >
            + 추가
          </button>
        </div>

        {ips.length === 0 ? (
          <p
            style={{
              padding: '18px',
              background: '#fff3dd',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.88rem',
              color: '#7a5200',
            }}
          >
            등록된 IP가 없어 <b>모든 IP에서 접속 가능</b>한 상태입니다. 특정 IP만 허용하려면 위에
            IP를 추가하고 저장하세요.
          </p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ips.map((ip) => (
              <li
                key={ip}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1.5px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {ip}
                  {ip === currentIp && (
                    <span
                      style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--brand)', fontWeight: 700 }}
                    >
                      (현재 IP)
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className={`${styles.smallBtn} ${styles.dangerBtn}`}
                  onClick={() => removeIp(ip)}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.saveBar}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveAll}
            disabled={!dirty || saving}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          {dirty && <span className={styles.dirty}>저장되지 않은 변경사항이 있습니다.</span>}
          {message && <span style={{ color: 'green', fontSize: '0.88rem' }}>{message}</span>}
          {error && <span className={styles.error}>{error}</span>}
        </div>
      </div>

      <p style={{ marginTop: 18, fontSize: '0.82rem', color: 'var(--ink-mute)' }}>
        💡 실수로 접속이 잠긴 경우: 서버에서 <code>backend/data/auth.json</code>의{' '}
        <code>allowedIps</code>를 <code>[]</code>로 수정하고 서버를 재시작하면 복구됩니다.
      </p>
    </div>
  );
}
