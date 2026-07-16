'use client';

import { useEffect, useRef, useState } from 'react';
import { adminFetch, uploadImage } from '@/lib/adminApi';
import styles from './admin.module.css';

interface Banner {
  image: string;
}

/** 홈 화면 상단 스크롤(슬라이드) 배너 관리: 추가 / 삭제 / 순서 변경 */
export default function BannerAdmin() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [saved, setSaved] = useState<Banner[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminFetch('/api/admin/banners')
      .then((d) => {
        setBanners(d.banners);
        setSaved(d.banners);
      })
      .catch((e) => setError(e.message));
  }, []);

  const dirty = JSON.stringify(banners) !== JSON.stringify(saved);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= banners.length) return;
    const next = [...banners];
    [next[i], next[j]] = [next[j], next[i]];
    setBanners(next);
    setMessage('');
  };

  const remove = (i: number) => {
    setBanners(banners.filter((_, idx) => idx !== i));
    setMessage('');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const path = await uploadImage(file);
      setBanners((prev) => [...prev, { image: path }]);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveAll = async () => {
    setSaving(true);
    setError('');
    try {
      const d = await adminFetch('/api/admin/banners', {
        method: 'PUT',
        body: JSON.stringify({ banners }),
      });
      setBanners(d.banners);
      setSaved(d.banners);
      setMessage('저장되었습니다. 홈 화면에 바로 반영됩니다.');
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
          홈 화면 상단 슬라이드 배너의 순서 변경 · 추가 · 삭제 후 <b>저장</b>을 눌러주세요.
        </p>
        <label className={`${styles.smallBtn} ${styles.primarySmall}`} style={{ cursor: 'pointer' }}>
          {uploading ? '업로드 중...' : '+ 배너 추가'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFile}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      </div>

      {banners.length === 0 ? (
        <div className={styles.empty}>배너가 없습니다. 이미지를 추가해주세요.</div>
      ) : (
        <div className={styles.bannerList}>
          {banners.map((b, i) => (
            <div key={`${b.image}-${i}`} className={styles.bannerItem}>
              <span className={styles.bannerOrder}>{i + 1}</span>
              <img src={b.image} alt={`배너 ${i + 1}`} />
              <span className={styles.bannerPath}>{b.image}</span>
              <div className={styles.rowActions}>
                <button type="button" className={styles.smallBtn} onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => move(i, 1)}
                  disabled={i === banners.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`${styles.smallBtn} ${styles.dangerBtn}`}
                  onClick={() => remove(i)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.saveBar}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={saveAll}
          disabled={!dirty || saving || banners.length === 0}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        {dirty && <span className={styles.dirty}>저장되지 않은 변경사항이 있습니다.</span>}
        {message && <span style={{ color: 'green', fontSize: '0.9rem' }}>{message}</span>}
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}
