'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Reveal from '@/components/Reveal';
import styles from './brand.module.css';

// 기존 brand.html의 소스 슬라이더 텍스트/이미지
const SAUCE_SLIDES = [
  {
    label: '미국식 베이스',
    title: '액상 양념 6종',
    items: ['아메리칸징', '파마산 갈릭', '치폴레', '허니 바베큐', '버팔로', '저크'],
    image: '/img/sauce_1.png',
  },
  {
    label: '미국식 베이스',
    title: '분말 양념 4종',
    items: ['레몬페퍼', '데저트 히트', '비네가 솔트', '스모키 바베큐'],
    image: '/img/sauce_2.png',
  },
  {
    label: '한국식 베이스',
    title: '액상 양념 3종',
    items: ['마마양념', '매운양념', '간장 마늘'],
    image: '/img/sauce_3.png',
  },
];

export default function BrandClient() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') === 'bi' ? 'bi' : 'story';
  const [slide, setSlide] = useState(0);
  const touchX = useRef(0);

  const current = SAUCE_SLIDES[slide];

  return (
    <>
      <div className="sub-hero" style={{ backgroundImage: "url('/img/sub_kv2.png')" }}>
        <div>
          <h1>브랜드 소개</h1>
          <p>미국 정통 스타일 그대로, 마마치킨</p>
        </div>
      </div>

      <div className={styles.tabWrap}>
        <div className="chip-tabs">
          <button
            type="button"
            className={`chip ${tab === 'story' ? 'active' : ''}`}
            onClick={() => router.push('/brand?tab=story')}
          >
            MAMA STORY
          </button>
          <button
            type="button"
            className={`chip ${tab === 'bi' ? 'active' : ''}`}
            onClick={() => router.push('/brand?tab=bi')}
          >
            MAMA BI
          </button>
        </div>
      </div>

      {tab === 'story' ? (
        <>
          <Reveal>
            <div className={styles.storyImg}>
              <img src="/img/story_1.png" alt="마마 스토리" className="pc-only" />
              <img src="/img/story_1_mo.png" alt="마마 스토리" className="mo-only" />
            </div>
          </Reveal>

          {/* 소스 슬라이더 (기존 sauce-slide) */}
          <section className={styles.sauceSection}>
            <div className={`container ${styles.sauceGrid}`}>
              <Reveal className={styles.sauceTxt}>
                <div>
                  <span className={styles.sauceLabel}>{current.label}</span>
                  <h3>{current.title}</h3>
                  <ul>
                    {current.items.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <div className={styles.sauceArrows}>
                    <button
                      type="button"
                      aria-label="이전"
                      onClick={() => setSlide((slide + SAUCE_SLIDES.length - 1) % SAUCE_SLIDES.length)}
                    >
                      ‹
                    </button>
                    <span>
                      {slide + 1} / {SAUCE_SLIDES.length}
                    </span>
                    <button
                      type="button"
                      aria-label="다음"
                      onClick={() => setSlide((slide + 1) % SAUCE_SLIDES.length)}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={120}>
                <div
                  className={styles.sauceImg}
                  onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
                  onTouchEnd={(e) => {
                    const dx = e.changedTouches[0].clientX - touchX.current;
                    if (dx > 40) setSlide((slide + SAUCE_SLIDES.length - 1) % SAUCE_SLIDES.length);
                    if (dx < -40) setSlide((slide + 1) % SAUCE_SLIDES.length);
                  }}
                >
                  <img key={current.image} src={current.image} alt={current.title} />
                </div>
              </Reveal>
            </div>
          </section>

          <Reveal>
            <div className={styles.storyImg}>
              <img src="/img/story_2.png" alt="마마치킨 이야기" className="pc-only" />
              <img src="/img/story_2_mo.png" alt="마마치킨 이야기" className="mo-only" />
            </div>
          </Reveal>
        </>
      ) : (
        <Reveal>
          <div className={styles.storyImg}>
            <img src="/img/bi.png" alt="마마치킨 BI" className="pc-only" />
            <img src="/img/bi_mo.png" alt="마마치킨 BI" className="mo-only" />
          </div>
        </Reveal>
      )}
    </>
  );
}
