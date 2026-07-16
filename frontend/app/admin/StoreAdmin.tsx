'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import type { Store } from '@/lib/types';
import styles from './admin.module.css';

interface StoreForm {
  id?: number;
  name: string;
  shortName: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  hours: string; // 줄바꿈으로 구분해 입력
  mapEmbed: string;
}

const EMPTY: StoreForm = {
  name: '',
  shortName: '',
  city: '서울',
  district: '',
  address: '',
  phone: '',
  hours: '',
  mapEmbed: '',
};

export default function StoreAdmin() {
  const [items, setItems] = useState<Store[]>([]);
  const [form, setForm] = useState<StoreForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAll = () =>
    adminFetch('/api/admin/stores')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadAll();
  }, []);

  const openNew = () => {
    setError('');
    setForm({ ...EMPTY });
  };

  const openEdit = (s: Store) => {
    setError('');
    setForm({
      id: s.id,
      name: s.name,
      shortName: s.shortName,
      city: s.city,
      district: s.district,
      address: s.address,
      phone: s.phone,
      hours: s.hours.join('\n'),
      mapEmbed: s.mapEmbed,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({
        name: form.name,
        shortName: form.shortName || form.name,
        city: form.city,
        district: form.district,
        address: form.address,
        phone: form.phone,
        hours: form.hours,
        mapEmbed: form.mapEmbed,
      });
      if (form.id) {
        await adminFetch(`/api/admin/stores/${form.id}`, { method: 'PUT', body });
      } else {
        await adminFetch('/api/admin/stores', { method: 'POST', body });
      }
      await loadAll();
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Store) => {
    if (!window.confirm(`'${s.name}' 매장을 삭제할까요?`)) return;
    try {
      await adminFetch(`/api/admin/stores/${s.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <p style={{ color: 'var(--ink-mute)', fontSize: '0.92rem' }}>
          매장 정보를 관리합니다. 매장찾기 페이지와 홈 화면 검색에 바로 반영됩니다.
        </p>
        <button type="button" className={`${styles.smallBtn} ${styles.primarySmall}`} onClick={openNew}>
          + 매장 추가
        </button>
      </div>

      {error && !form && <p className={styles.error}>{error}</p>}

      {items.length === 0 ? (
        <div className={styles.empty}>등록된 매장이 없습니다.</div>
      ) : (
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>번호</th>
              <th>매장명</th>
              <th style={{ width: 130 }}>지역</th>
              <th>주소</th>
              <th style={{ width: 140 }}>연락처</th>
              <th style={{ width: 140 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>
                  <strong>{s.name}</strong>
                </td>
                <td>
                  {s.city} {s.district}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{s.address}</td>
                <td>{s.phone}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.smallBtn} onClick={() => openEdit(s)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className={`${styles.smallBtn} ${styles.dangerBtn}`}
                      onClick={() => remove(s)}
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
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div style={{ padding: '36px 32px' }}>
              <h2 style={{ fontWeight: 800, marginBottom: 20 }}>
                {form.id ? '매장 수정' : '매장 추가'}
              </h2>
              <form className={styles.formGrid} onSubmit={submit}>
                <div className={styles.formRow2}>
                  <label>
                    매장명 *
                    <input
                      type="text"
                      required
                      placeholder="마마치킨 ○○점"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>
                  <label>
                    짧은 이름 (검색용)
                    <input
                      type="text"
                      placeholder="비우면 매장명과 동일"
                      value={form.shortName}
                      onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                    />
                  </label>
                </div>

                <div className={styles.formRow2}>
                  <label>
                    시/도 *
                    <input
                      type="text"
                      required
                      placeholder="서울"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </label>
                  <label>
                    구/군 *
                    <input
                      type="text"
                      required
                      placeholder="마포구"
                      value={form.district}
                      onChange={(e) => setForm({ ...form, district: e.target.value })}
                    />
                  </label>
                </div>

                <label>
                  주소 *
                  <input
                    type="text"
                    required
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </label>

                <label>
                  연락처
                  <input
                    type="text"
                    placeholder="02-000-0000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>

                <label>
                  운영시간 (한 줄에 하나씩)
                  <textarea
                    style={{ minHeight: 80 }}
                    placeholder={'12:00~23:30(월-금)\n13:00~23:00(토-일)'}
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                  />
                </label>

                <label>
                  구글 지도 퍼가기 주소
                  <input
                    type="text"
                    placeholder="https://www.google.com/maps/embed?pb=..."
                    value={form.mapEmbed}
                    onChange={(e) => setForm({ ...form, mapEmbed: e.target.value })}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--ink-mute)', fontWeight: 400 }}>
                    구글지도에서 매장 검색 → 공유 → &quot;지도 퍼가기&quot; → iframe의 src 주소만 복사해
                    붙여넣으세요.
                  </span>
                </label>

                {form.mapEmbed && (
                  <iframe
                    src={form.mapEmbed}
                    style={{ width: '100%', height: 180, border: 0, borderRadius: 12 }}
                    loading="lazy"
                    title="지도 미리보기"
                  />
                )}

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
