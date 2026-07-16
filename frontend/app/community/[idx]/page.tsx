'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import CommunityTabs from '@/components/CommunityTabs';
import EventBadge, { eventPeriodText } from '@/components/EventBadge';
import { formatDate } from '@/lib/format';
import Reveal from '@/components/Reveal';
import type { Post } from '@/lib/types';
import styles from '../community.module.css';

export default function PostViewPage() {
  const { idx } = useParams<{ idx: string }>();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/posts/${idx}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(setPost)
      .catch(() => setNotFound(true));
  }, [idx]);

  // 기존 bbs_view.php의 목록 보기 로직: 글 유형에 따라 목록 경로 분기
  const listHref = post?.type === 'event' ? '/community/events' : '/community';

  return (
    <>
      <div className="sub-hero" style={{ backgroundImage: "url('/img/sub_kv3.png')" }}>
        <div>
          <h1>커뮤니티</h1>
          <p>{post?.type === 'event' ? '이벤트' : '새소식'}</p>
        </div>
      </div>

      <CommunityTabs active={listHref} />

      <section className="section">
        <div className="container">
          {notFound ? (
            <div className={styles.contactCard}>
              <h2>게시글을 찾을 수 없습니다</h2>
              <div className={styles.contactBtns}>
                <button type="button" className="btn btn-primary" onClick={() => router.push('/community')}>
                  목록으로
                </button>
              </div>
            </div>
          ) : post ? (
            <Reveal>
              <article className={styles.viewCard}>
                <h1>
                  <EventBadge status={post.status} /> {post.title}
                </h1>
                <p className={styles.viewDate}>
                  {post.type === 'event' ? (
                    eventPeriodText(post) ? (
                      <>이벤트 기간 : {eventPeriodText(post)}</>
                    ) : (
                      '상시 진행'
                    )
                  ) : (
                    <>작성일 : {formatDate(post.date)}</>
                  )}
                </p>

                <div
                  className={styles.viewContent}
                  dangerouslySetInnerHTML={{ __html: post.content || '' }}
                />

                <nav className={styles.viewNav}>
                  {post.prev ? (
                    <Link href={`/community/${post.prev.idx}`}>
                      <b>▲ 이전글</b>
                      <strong>{post.prev.title}</strong>
                    </Link>
                  ) : (
                    <span>
                      <b>▲ 이전글</b> 없음
                    </span>
                  )}
                  {post.next ? (
                    <Link href={`/community/${post.next.idx}`}>
                      <b>▼ 다음글</b>
                      <strong>{post.next.title}</strong>
                    </Link>
                  ) : (
                    <span>
                      <b>▼ 다음글</b> 없음
                    </span>
                  )}
                </nav>

                <div className={styles.backBtn}>
                  <Link href={listHref} className="btn btn-ghost">
                    목록 보기
                  </Link>
                </div>
              </article>
            </Reveal>
          ) : (
            <div className="skeleton" style={{ height: 400, maxWidth: 900, margin: '0 auto' }} />
          )}
        </div>
      </section>
    </>
  );
}
