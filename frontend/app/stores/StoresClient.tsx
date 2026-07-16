'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Reveal from '@/components/Reveal';
import type { Store } from '@/lib/types';
import styles from './stores.module.css';

export default function StoresClient() {
  const params = useSearchParams();

  const [allStores, setAllStores] = useState<Store[]>([]);
  const [filtered, setFiltered] = useState<Store[]>([]);
  const [selected, setSelected] = useState<Store | null>(null);
  const [city, setCity] = useState(params.get('city') || '');
  const [district, setDistrict] = useState(params.get('district') || '');
  const [keyword, setKeyword] = useState(params.get('q') || '');

  const search = (c = city, d = district, q = keyword) => {
    const qs = new URLSearchParams();
    if (c) qs.set('city', c);
    if (d) qs.set('district', d);
    if (q) qs.set('q', q);
    fetch(`/api/stores?${qs.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        setFiltered(res.items);
        setSelected((prev) =>
          res.items.length ? res.items.find((s: Store) => s.id === prev?.id) ?? res.items[0] : null
        );
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((res) => setAllStores(res.items))
      .catch(console.error);
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cities = [...new Set(allStores.map((s) => s.city))];
  const districts = [...new Set(allStores.filter((s) => !city || s.city === city).map((s) => s.district))];

  return (
    <>
      <div className="sub-hero" style={{ backgroundImage: "url('/img/sub_kv5.png')" }}>
        <div>
          <h1>매장 찾기</h1>
          <p>가까운 마마치킨을 찾아보세요</p>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <Reveal>
            <div className={styles.searchCard}>
              <select
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setDistrict('');
                }}
              >
                <option value="">시,도 선택</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                <option value="">구,군 선택</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="매장명을 입력해주세요."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <button type="button" className="btn btn-primary" onClick={() => search()}>
                매장 검색
              </button>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className={styles.mapGrid}>
              <ul className={styles.storeList}>
                {filtered.length === 0 && <li className={styles.empty}>검색 결과가 없습니다.</li>}
                {filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`${styles.storeItem} ${selected?.id === s.id ? styles.storeActive : ''}`}
                      onClick={() => setSelected(s)}
                    >
                      <strong>{s.name}</strong>
                      <p>{s.address}</p>
                      <p>연락처 : {s.phone}</p>
                      <dl>
                        <dt>운영시간 :</dt>
                        <dd>
                          {s.hours.map((h) => (
                            <span key={h}>{h}</span>
                          ))}
                        </dd>
                      </dl>
                    </button>
                  </li>
                ))}
              </ul>

              <div className={styles.mapBox}>
                {selected ? (
                  <iframe
                    key={selected.id}
                    src={selected.mapEmbed}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`${selected.name} 지도`}
                  />
                ) : (
                  <div className={styles.mapPlaceholder}>매장을 선택해주세요</div>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
