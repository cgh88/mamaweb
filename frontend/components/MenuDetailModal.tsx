'use client';

import { useEffect, useRef, useState } from 'react';
import type { DetailData, RecommFoodItem } from '@/lib/types';
import styles from './MenuDetailModal.module.css';

interface Props {
  item: DetailData;
  recommFood?: RecommFoodItem[];
  onClose: () => void;
}

/**
 * 메뉴 상세 팝업 — 기존 사이트의 detail-popup 로직과 동일
 *  - 메뉴명(+매운맛 아이콘) / 영문명 / 이미지 / 설명 / 원산지 / 고지문구 2줄
 *  - 하단 추천메뉴 슬라이더: 클릭 시 상세 내용이 해당 추천메뉴로 교체됨
 */
export default function MenuDetailModal({ item, recommFood = [], onClose }: Props) {
  const [current, setCurrent] = useState<DetailData>(item);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCurrent(item), [item]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const scrollSlider = (dir: -1 | 1) => {
    sliderRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });
  };

  const originText = current.origin?.replace(/^\[|\]$/g, '').trim();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
          ✕
        </button>

        <div className={styles.body}>
          <div className={styles.head}>
            <h3>
              {current.name}
              {current.spicyImage && (
                <img src={current.spicyImage} alt="매운맛" className={styles.spicy} />
              )}
            </h3>
            <p className={styles.nameEn}>{current.nameEn}</p>
          </div>

          <div className={styles.detail}>
            <figure className={styles.imgBox}>
              <img src={current.image} alt={current.name} />
            </figure>
            <div className={styles.txt}>
              <p className={styles.desc}>{current.description}</p>
              {originText && <p className={styles.origin}>[{originText}]</p>}
              <ul className={styles.notice}>
                <li>마마치킨은 주문과 동시에 조리를 원칙으로 합니다.</li>
                <li>메뉴사진은 연출된 사진으로 실제 제공된 제품과 차이가 있을 수 있습니다.</li>
              </ul>
            </div>
          </div>

          {recommFood.length > 0 && (
            <div className={styles.recomm}>
              <div className={styles.recommHead}>
                <h4>추천메뉴</h4>
                <div className={styles.arrows}>
                  <button type="button" aria-label="이전" onClick={() => scrollSlider(-1)}>‹</button>
                  <button type="button" aria-label="다음" onClick={() => scrollSlider(1)}>›</button>
                </div>
              </div>
              <div className={styles.slider} ref={sliderRef}>
                {recommFood.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    className={styles.slide}
                    onClick={() =>
                      setCurrent({
                        name: f.name,
                        nameEn: f.nameEn,
                        image: f.detailImage,
                        description: f.description,
                        origin: f.origin,
                        spicyImage: f.spicyImage ?? null,
                      })
                    }
                  >
                    <img src={f.image} alt={f.name} />
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
