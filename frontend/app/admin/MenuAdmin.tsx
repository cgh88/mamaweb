'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import type { MenuItem, SauceTab } from '@/lib/types';
import ImageField from './ImageField';
import styles from './admin.module.css';

interface MenuForm {
  id?: number;
  category: string;
  subTab: string;
  name: string;
  nameEn: string;
  image: string;
  description: string;
  origin: string;
}

const EMPTY: MenuForm = {
  category: 'BEST MENU',
  subTab: '',
  name: '',
  nameEn: '',
  image: '',
  description: '',
  origin: '원료육 : 국내산',
};

export default function MenuAdmin() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sauceTabs, setSauceTabs] = useState<SauceTab[]>([]);
  const [filter, setFilter] = useState('전체');
  const [form, setForm] = useState<MenuForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAll = () =>
    adminFetch('/api/admin/menu')
      .then((d) => {
        setItems(d.items);
        setCategories(d.categories);
        setSauceTabs(d.sauceTabs);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = filter === '전체' ? items : items.filter((m) => m.category === filter);

  const openNew = () => {
    setError('');
    setForm({ ...EMPTY, category: filter === '전체' ? 'BEST MENU' : filter });
  };

  const openEdit = (m: MenuItem) => {
    setError('');
    setForm({
      id: m.id,
      category: m.category,
      subTab: m.subTab || '',
      name: m.name,
      nameEn: m.nameEn,
      image: m.image,
      description: m.description,
      origin: m.origin,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({
        category: form.category,
        subTab: form.category === '소스 치킨' ? form.subTab || sauceTabs[0]?.name : null,
        name: form.name,
        nameEn: form.nameEn,
        image: form.image,
        description: form.description,
        origin: form.origin,
      });
      if (form.id) {
        await adminFetch(`/api/admin/menu/${form.id}`, { method: 'PUT', body });
      } else {
        await adminFetch('/api/admin/menu', { method: 'POST', body });
      }
      await loadAll();
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: MenuItem) => {
    if (!window.confirm(`'${m.name}' 메뉴를 삭제할까요?`)) return;
    try {
      await adminFetch(`/api/admin/menu/${m.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          {['전체', ...categories].map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.filterBtn} ${filter === c ? styles.filterActive : ''}`}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button type="button" className={`${styles.smallBtn} ${styles.primarySmall}`} onClick={openNew}>
          + 메뉴 추가
        </button>
      </div>

      {error && !form && <p className={styles.error}>{error}</p>}

      {filtered.length === 0 ? (
        <div className={styles.empty}>메뉴가 없습니다.</div>
      ) : (
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th>이미지</th>
              <th>메뉴명</th>
              <th>카테고리</th>
              <th>서브탭</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <img src={m.image} alt={m.name} className={styles.thumb} />
                </td>
                <td>
                  <strong>{m.name}</strong>
                  <br />
                  <span style={{ fontSize: '0.8rem', color: 'var(--ink-mute)' }}>{m.nameEn}</span>
                </td>
                <td>{m.category}</td>
                <td>{m.subTab || '-'}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.smallBtn} onClick={() => openEdit(m)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className={`${styles.smallBtn} ${styles.dangerBtn}`}
                      onClick={() => remove(m)}
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
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ padding: '36px 32px' }}>
              <h2 style={{ fontWeight: 800, marginBottom: 20 }}>
                {form.id ? '메뉴 수정' : '메뉴 추가'}
              </h2>
              <form className={styles.formGrid} onSubmit={submit}>
                <div className={styles.formRow2}>
                  <label>
                    카테고리
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  {form.category === '소스 치킨' && (
                    <label>
                      서브탭 (소스)
                      <select
                        value={form.subTab || sauceTabs[0]?.name || ''}
                        onChange={(e) => setForm({ ...form, subTab: e.target.value })}
                      >
                        {sauceTabs.map((t) => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className={styles.formRow2}>
                  <label>
                    메뉴명 *
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>
                  <label>
                    영문명
                    <input
                      type="text"
                      value={form.nameEn}
                      onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                    />
                  </label>
                </div>

                <ImageField
                  label="메뉴 이미지 *"
                  value={form.image}
                  onChange={(image) => setForm({ ...form, image })}
                />

                <label>
                  설명
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </label>

                <label>
                  원산지 표기
                  <input
                    type="text"
                    value={form.origin}
                    onChange={(e) => setForm({ ...form, origin: e.target.value })}
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
                    disabled={saving || !form.image}
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
