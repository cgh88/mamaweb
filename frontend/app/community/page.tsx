'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CommunityTabs from '@/components/CommunityTabs';
import Reveal from '@/components/Reveal';
import { formatDate } from '@/lib/format';
import type { Post } from '@/lib/types';

export default function NoticeListPage() {
  const [items, setItems] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/posts?type=notice')
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
              <span className="eyebrow">News</span>
              <h2>새소식</h2>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <table className="table-modern">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>번호</th>
                  <th>제목</th>
                  <th style={{ width: 140 }}>작성일</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.idx}>
                    <td>{items.length - i}</td>
                    <td className="title-cell">
                      <Link href={`/community/${p.idx}`}>{p.title}</Link>
                    </td>
                    <td>{formatDate(p.date)}</td>
                  </tr>
                ))}
                {loaded && items.length === 0 && (
                  <tr>
                    <td colSpan={3}>등록된 게시글이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>
    </>
  );
}
