'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import EventBadge, { eventPeriodText } from '@/components/EventBadge';
import { formatDate } from '@/lib/format';
import HeroSlider from '@/components/HeroSlider';
import MenuDetailModal from '@/components/MenuDetailModal';
import Reveal from '@/components/Reveal';
import type { DetailData, HomeData, Store } from '@/lib/types';
import styles from './page.module.css';

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [keyword, setKeyword] = useState('');
  const recommRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/home').then((r) => r.json()).then(setData).catch(console.error);
    fetch('/api/stores').then((r) => r.json()).then((d) => setStores(d.items)).catch(console.error);
  }, []);

  const openDetail = (d: { name: string; nameEn: string; detailImage: string; description: string; origin: string; spicyImage?: string | null }) =>
    setDetail({
      name: d.name,
      nameEn: d.nameEn,
      image: d.detailImage,
      description: d.description,
      origin: d.origin,
      spicyImage: d.spicyImage ?? null,
    });

  const scrollRecomm = (dir: -1 | 1) =>
    recommRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });

  if (!data) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <div className="skeleton" style={{ height: 420, marginBottom: 40 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  const cities = [...new Set(stores.map((s) => s.city))];
  const districts = [...new Set(stores.filter((s) => !city || s.city === city).map((s) => s.district))];

  return (
    <>
      {/* 메인 배너 */}
      <HeroSlider banners={data.banners} />

      {/* NEW MENU */}
      <section className="section">
        <div className="container">
          <Reveal>
            <div className="section-head center">
              <span className="eyebrow">Fresh from the fryer</span>
              <h2>✨ NEW MENU ✨</h2>
              <p className="desc">마마치킨이 새롭게 선보이는 신메뉴를 만나보세요</p>
            </div>
          </Reveal>

          <ul className={styles.newGrid}>
            {data.newMenu.map((m, i) => (
              <Reveal key={m.name} as="li" delay={i * 120}>
                <button type="button" className={`card ${styles.newCard}`} onClick={() => openDetail(m)}>
                  <span className={styles.newBadge}>NEW</span>
                  <img src={m.image} alt={m.name} />
                </button>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* RECOMMEND MENU */}
      <section className={`section ${styles.recommendSection}`}>
        <div className="container">
          <Reveal>
            <div className={styles.recommendHead}>
              <div className="section-head" style={{ marginBottom: 0 }}>
                <span className="eyebrow">Most loved</span>
                <h2>RECOMMEND MENU 🔥</h2>
              </div>
              <div className={styles.arrows}>
                <button type="button" aria-label="이전" onClick={() => scrollRecomm(-1)}>‹</button>
                <button type="button" aria-label="다음" onClick={() => scrollRecomm(1)}>›</button>
              </div>
            </div>
          </Reveal>

          <div className={styles.recommendSlider} ref={recommRef}>
            {data.recommendMenu.map((m, i) => (
              <Reveal key={m.title} delay={i * 100} className={styles.recommendSlideWrap}>
                <button type="button" className={styles.recommendCard} onClick={() => openDetail(m)}>
                  <figure>
                    <img src={m.image} alt={m.title} />
                  </figure>
                  <div className={styles.recommendTxt}>
                    <span className={styles.bestBadge}>{m.category}</span>
                    <strong>{m.title}</strong>
                    <em>{m.subtitle}</em>
                  </div>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 매장찾기 */}
      <section className={`section ${styles.storeSection}`}>
        <div className="container">
          <Reveal>
            <div className="section-head center">
              <span className="eyebrow">Find us</span>
              <h2>매장찾기 📍</h2>
              <p className="desc">가까운 마마치킨 매장을 찾아보세요</p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className={styles.searchCard}>
              <div className={styles.searchRow}>
                <div className={styles.searchInput}>
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="매장명을 입력해주세요."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </div>
                <select value={city} onChange={(e) => { setCity(e.target.value); setDistrict(''); }}>
                  <option value="">시,도 선택</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                  <option value="">구 선택</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <Link
                  href={`/stores?city=${encodeURIComponent(city)}&district=${encodeURIComponent(district)}&q=${encodeURIComponent(keyword)}`}
                  className="btn btn-primary"
                >
                  매장 검색
                </Link>
              </div>
              <Link href="/stores" className={styles.allStores}>
                전체 매장 보러가기 →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 이벤트 + 새소식 */}
      <section className="section">
        <div className={`container ${styles.newsGrid}`}>
          <Reveal>
            <div className={styles.newsCol}>
              <div className={styles.newsHead}>
                <h3>마마치킨 이벤트 🎉</h3>
                <Link href="/community/events">더보기 →</Link>
              </div>
              {data.events.map((ev) => (
                <Link key={ev.idx} href={`/community/${ev.idx}`} className={`card ${styles.eventCard}`}>
                  {ev.thumbnail && (
                    <img
                      src={ev.thumbnail}
                      alt={ev.title}
                      className={ev.status === 'ended' ? 'event-ended-img' : ''}
                    />
                  )}
                  <div className={styles.eventTxt}>
                    <strong>
                      <EventBadge status={ev.status} /> {ev.title}
                    </strong>
                    {eventPeriodText(ev) && <span>이벤트 기간 : {eventPeriodText(ev)}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className={styles.newsCol}>
              <div className={styles.newsHead}>
                <h3>새소식 ✒️</h3>
                <Link href="/community">더보기 →</Link>
              </div>
              <ul className={styles.noticeList}>
                {data.notices.map((n) => (
                  <li key={n.idx}>
                    <Link href={`/community/${n.idx}`}>
                      <strong>{n.title}</strong>
                      <span>{formatDate(n.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {detail && (
        <MenuDetailModal item={detail} recommFood={data.recommFood} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
