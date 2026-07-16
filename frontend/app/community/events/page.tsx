'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CommunityTabs from '@/components/CommunityTabs';
import EventBadge, { eventPeriodText } from '@/components/EventBadge';
import Reveal from '@/components/Reveal';
import type { Post } from '@/lib/types';
import styles from '../community.module.css';

export default function EventListPage() {
  const [items, setItems] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/posts?type=event')
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, []);

  return (
    <>
      <div className="sub-hero" style={{ backgroundImage: "url('/img/sub_kv3.png')" }}>
        <div>
          <h1>커뮤니티</h1>
          <p>마마치킨의 소식을 전해드립니다</p>
        </div>
      </div>

      <CommunityTabs />

      <section className="section">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">Event</span>
              <h2>이벤트</h2>
            </div>
          </Reveal>

          <div className={styles.eventGrid}>
            {items.map((p, i) => (
              <Reveal key={p.idx} delay={i * 100}>
                <Link href={`/community/${p.idx}`} className={`card ${styles.eventCard}`}>
                  {p.thumbnail && (
                    <img
                      src={p.thumbnail}
                      alt={p.title}
                      className={p.status === 'ended' ? 'event-ended-img' : ''}
                    />
                  )}
                  <div className={styles.eventTxt}>
                    <strong>
                      <EventBadge status={p.status} /> {p.title}
                    </strong>
                    {eventPeriodText(p) && (
                      <span className={styles.eventPeriod}>이벤트 기간 : {eventPeriodText(p)}</span>
                    )}
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
          {loaded && items.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--ink-mute)' }}>진행 중인 이벤트가 없습니다.</p>
          )}
        </div>
      </section>
    </>
  );
}
