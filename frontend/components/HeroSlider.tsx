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
    <div className={styles.hero}>
      <div className={styles.track} style={{ transform: `translateX(-${index * 100}%)` }}>
        {banners.map((b, i) => (
          <div key={b.image} className={styles.slide}>
            <img src={b.image} alt={`배너 ${i + 1}`} />
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
