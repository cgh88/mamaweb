'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import type { Post } from '@/lib/types';
import ImageField from './ImageField';
import styles from './admin.module.css';

interface PostForm {
  idx?: number;
  title: string;
  date: string;
  thumbnail: string;
  content: string;
  startDate: string;
  endDate: string;
}

const LABEL = { notice: '새소식', event: '이벤트' } as const;

export default function PostAdmin({ type }: { type: 'notice' | 'event' }) {
  const [items, setItems] = useState<Post[]>([]);
  const [form, setForm] = useState<PostForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAll = useCallback(
    () =>
      adminFetch(`/api/posts?type=${type}`)
        .then((d) => setItems(d.items))
        .catch((e) => setError(e.message)),
    [type]
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openNew = () => {
    setError('');
    setForm({
      title: '',
      date: new Date().toISOString().slice(0, 10),
      thumbnail: '',
      content: '',
      startDate: '',
      endDate: '',
    });
  };

  const openEdit = async (p: Post) => {
    setError('');
    try {
      const full = await adminFetch(`/api/posts/${p.idx}`);
      setForm({
        idx: full.idx,
        title: full.title,
        date: full.date,
        thumbnail: full.thumbnail || '',
        content: full.content || '',
        startDate: full.startDate || '',
        endDate: full.endDate || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '불러오기 실패');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({
        type,
        title: form.title,
        date: form.date,
        thumbnail: form.thumbnail || null,
        content: form.content,
        ...(type === 'event' && {
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      });
      if (form.idx) {
        await adminFetch(`/api/admin/posts/${form.idx}`, { method: 'PUT', body });
      } else {
        await adminFetch('/api/admin/posts', { method: 'POST', body });
      }
      await loadAll();
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Post) => {
    if (!window.confirm(`'${p.title}' 게시글을 삭제할까요?`)) return;
    try {
      await adminFetch(`/api/admin/posts/${p.idx}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <p style={{ color: 'var(--ink-mute)', fontSize: '0.92rem' }}>
          {LABEL[type]} 게시글을 관리합니다. 본문은 HTML을 지원합니다.
        </p>
        <button type="button" className={`${styles.smallBtn} ${styles.primarySmall}`} onClick={openNew}>
          + {LABEL[type]} 작성
        </button>
      </div>

      {error && !form && <p className={styles.error}>{error}</p>}

      {items.length === 0 ? (
        <div className={styles.empty}>등록된 {LABEL[type]}이(가) 없습니다.</div>
      ) : (
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>번호</th>
              {type === 'event' && <th>썸네일</th>}
              <th>제목</th>
              {type === 'event' && <th style={{ width: 200 }}>이벤트 기간</th>}
              <th style={{ width: 130 }}>작성일</th>
              <th style={{ width: 140 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.idx}>
                <td>{p.idx}</td>
                {type === 'event' && (
                  <td>
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt="" className={styles.thumb} />
                    ) : (
                      '-'
                    )}
                  </td>
                )}
                <td>
                  <strong>{p.title}</strong>
                </td>
                {type === 'event' && (
                  <td>
                    {p.startDate || p.endDate ? (
                      <>
                        {p.startDate ?? ''} ~ {p.endDate ?? ''}
                        <br />
                        <span
                          className={`event-badge event-badge--${p.status ?? 'ongoing'}`}
                        >
                          {p.status === 'ended' ? '종료' : p.status === 'upcoming' ? '예정' : '진행중'}
                        </span>
                      </>
                    ) : (
                      '상시'
                    )}
                  </td>
                )}
                <td>{p.date}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.smallBtn} onClick={() => openEdit(p)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className={`${styles.smallBtn} ${styles.dangerBtn}`}
                      onClick={() => remove(p)}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div style={{ padding: '36px 32px' }}>
              <h2 style={{ fontWeight: 800, marginBottom: 20 }}>
                {form.idx ? `${LABEL[type]} 수정` : `${LABEL[type]} 작성`}
              </h2>
              <form className={styles.formGrid} onSubmit={submit}>
                <label>
                  제목 *
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </label>

                <label>
                  작성일
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </label>

                {type === 'event' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <label>
                        이벤트 시작일
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        />
                      </label>
                      <label>
                        이벤트 종료일
                        <input
                          type="date"
                          value={form.endDate}
                          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                        />
                      </label>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--ink-mute)' }}>
                      종료일이 지나면 사이트에 자동으로 <b>[종료]</b> 배지가 표시됩니다. 비워두면 상시
                      진행으로 표시됩니다.
                    </p>
                    <ImageField
                      label="썸네일 이미지"
                      value={form.thumbnail}
                      onChange={(thumbnail) => setForm({ ...form, thumbnail })}
                    />
                  </>
                )}

                <label>
                  본문 (HTML 지원)
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="<p>내용을 입력하세요</p>"
                  />
                </label>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.formActions}>
                  <button type="button" className={styles.smallBtn} onClick={() => setForm(null)}>
                    취소
                  </button>
                  <button
                    type="submit"
                    className={`${styles.smallBtn} ${styles.primarySmall}`}
                    disabled={saving}
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
