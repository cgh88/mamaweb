'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './HeroSlider.module.css';

interface Props {
  banners: { image: string }[];
}

export default function HeroSlider({ banners }: Props) {
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const next = useCallback(() => setIndex((i) => (i + 1) % banners.length), [banners.length]);

  const restart = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(next, 4500);
  }, [next]);

  useEffect(() => {
    restart();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [restart]);

  const go = (i: number) => {
    setIndex(i);
    restart();
  };

  return (
    // overflow/width는 인라인으로도 지정: CSS 청크가 늦게 적용되는 순간에도
    // 슬라이드 트랙(배너 수 x 100%)이 페이지 폭을 넓혀 헤더가 밀리는 것을 방지
    <div className={styles.hero} style={{ overflow: 'hidden', maxWidth: '100%' }}>
      <div
        className={styles.track}
        style={{ transform: `translateX(-${index * 100}%)`, display: 'flex' }}
      >
        {banners.map((b, i) => (
          <div key={b.image} className={styles.slide} style={{ flex: '0 0 100%', minWidth: 0 }}>
            <img src={b.image} alt={`배너 ${i + 1}`} style={{ width: '100%' }} />
          </div>
        ))}
      </div>

      <div className={styles.dots}>
        {banners.map((b, i) => (
          <button
            key={b.image}
            type="button"
            aria-label={`${i + 1}번 배너`}
            className={i === index ? styles.dotActive : styles.dot}
            onClick={() => go(i)}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="이전 배너"
        className={`${styles.arrow} ${styles.prev}`}
        onClick={() => go((index - 1 + banners.length) % banners.length)}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="다음 배너"
        className={`${styles.arrow} ${styles.next}`}
        onClick={() => go((index + 1) % banners.length)}
      >
        ›
      </button>
    </div>
  );
}
