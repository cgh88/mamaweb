'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import MenuDetailModal from '@/components/MenuDetailModal';
import Reveal from '@/components/Reveal';
import type { DetailData, MenuItem, MenuResponse, RecommFoodItem, SauceTab } from '@/lib/types';
import styles from './menu.module.css';

// 기존 사이트와 동일한 카테고리 구성 (menu.php?ct=...)
const CATEGORIES = ['BEST MENU', '후라이드 치킨', '소스 치킨', '베이스 소스', '딥 소스', '사이드'];

export default function MenuClient() {
  const router = useRouter();
  const params = useSearchParams();
  const ct = params.get('ct') || 'BEST MENU';
  const tab = params.get('tab');

  const [data, setData] = useState<MenuResponse | null>(null);
  const [sauceTabs, setSauceTabs] = useState<SauceTab[]>([]);
  const [recommFood, setRecommFood] = useState<RecommFoodItem[]>([]);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/menu/categories')
      .then((r) => r.json())
      .then((d) => setSauceTabs(d.sauceTabs))
      .catch(console.error);
    fetch('/api/home')
      .then((r) => r.json())
      .then((d) => setRecommFood(d.recommFood))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ ct });
    if (tab) qs.set('tab', tab);
    fetch(`/api/menu?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ct, tab]);

  const goCategory = (category: string) => {
    // 기존 로직 동일: 카테고리 이동 시 tab 초기화
    router.push(category === 'BEST MENU' ? '/menu' : `/menu?ct=${encodeURIComponent(category)}`);
  };

  const goTab = (t: string) => {
    // 기존 click_tab 로직: /menu.php?ct=소스 치킨&tab=<서브탭>
    router.push(`/menu?ct=${encodeURIComponent('소스 치킨')}&tab=${encodeURIComponent(t)}`);
  };

  const activeTab = data?.tab || sauceTabs[0]?.name;
  const activeTabIdx = sauceTabs.findIndex((t) => t.name === activeTab);

  // 기존 tab-prev / tab-next 로직과 동일: 순서 고정, 양끝에서 멈춤
  const goPrevTab = () => {
    if (activeTabIdx < 0) return;
    goTab(sauceTabs[Math.max(0, activeTabIdx - 1)].name);
  };
  const goNextTab = () => {
    if (activeTabIdx < 0) return;
    goTab(sauceTabs[Math.min(sauceTabs.length - 1, activeTabIdx + 1)].name);
  };

  // 기존 detail 로직 동일: 리스트 아이템의 이미지/alt/data-memo/tit/sub로 팝업 구성
  const openDetail = (item: MenuItem) =>
    setDetail({
      name: item.name,
      nameEn: item.nameEn,
      image: item.image,
      description: item.description,
      origin: item.origin,
    });

  return (
    <>
      {/* sub hero */}
      <div className="sub-hero" style={{ backgroundImage: "url('/img/sub_kv1.png')" }}>
        <div>
          <h1>메뉴 안내</h1>
          <p>내 가족이 먹는다는 생각으로 만든 ‘마마치킨’입니다.</p>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className={styles.tabWrap}>
        <div className="container">
          <div className="chip-tabs">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${ct === c ? 'active' : ''}`}
                onClick={() => goCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 소스 치킨 서브탭 슬라이더 (기존 tab-slide 로직) */}
      {ct === '소스 치킨' && sauceTabs.length > 0 && (
        <div className={styles.sauceSlide}>
          <div className={`container ${styles.sauceInner}`}>
            <button
              type="button"
              className={styles.sauceArrow}
              aria-label="이전 소스"
              onClick={goPrevTab}
              disabled={activeTabIdx <= 0}
            >
              ‹
            </button>
            <ul className={styles.sauceList}>
              {sauceTabs.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    className={`${styles.sauceItem} ${t.name === activeTab ? styles.sauceActive : ''}`}
                    onClick={() => goTab(t.name)}
                  >
                    <img src={t.image} alt={t.name} />
                    <span>{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.sauceArrow}
              aria-label="다음 소스"
              onClick={goNextTab}
              disabled={activeTabIdx >= sauceTabs.length - 1}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* 메뉴 그리드 */}
      <section className={`section ${styles.listSection}`}>
        <div className="container">
          {loading ? (
            <div className={styles.grid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 320 }} />
              ))}
            </div>
          ) : (
            <ul className={styles.grid}>
              {data?.items.map((item, i) => (
                <Reveal key={item.id} as="li" delay={(i % 3) * 90}>
                  <button type="button" className={`card ${styles.menuCard}`} onClick={() => openDetail(item)}>
                    <figure>
                      <img src={item.image} alt={item.description} loading="lazy" />
                    </figure>
                    <div className={styles.menuTxt}>
                      <strong>{item.name}</strong>
                      <span>{item.nameEn}</span>
                    </div>
                  </button>
                </Reveal>
              ))}
            </ul>
          )}

          <p className={styles.hint}>메뉴를 클릭하면 상세 정보를 확인할 수 있습니다.</p>
        </div>
      </section>

      {detail && (
        <MenuDetailModal item={detail} recommFood={recommFood} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
