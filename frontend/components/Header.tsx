'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './Header.module.css';

const NAV = [
  {
    label: '브랜드소개',
    href: '/brand',
    sub: [
      { label: 'MAMA STORY', href: '/brand?tab=story' },
      { label: 'MAMA BI', href: '/brand?tab=bi' },
    ],
  },
  {
    label: '메뉴',
    href: '/menu',
    sub: [
      { label: 'BEST MENU', href: '/menu' },
      { label: '후라이드 치킨', href: '/menu?ct=후라이드 치킨' },
      { label: '소스 치킨', href: '/menu?ct=소스 치킨' },
      { label: '베이스 소스', href: '/menu?ct=베이스 소스' },
      { label: '딥 소스', href: '/menu?ct=딥 소스' },
      { label: '사이드', href: '/menu?ct=사이드' },
    ],
  },
  {
    label: '매장찾기',
    href: '/stores',
    sub: [{ label: '매장찾기', href: '/stores' }],
  },
  {
    label: '커뮤니티',
    href: '/community',
    sub: [
      { label: '새소식', href: '/community' },
      { label: '이벤트', href: '/community/events' },
      { label: '고객의 소리', href: '/community/voice' },
      { label: '제휴문의', href: '/community/partnership' },
    ],
  },
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // drawerMounted: DOM 존재 여부 / drawerOpen: 슬라이드 인 상태
  // 닫혀 있을 때는 DOM에서 완전히 제거해야 모바일 브라우저가 화면 밖 요소를
  // 페이지 폭으로 계산해 레이아웃이 어긋나는 문제를 막을 수 있음
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openDrawer = () => {
    setDrawerMounted(true);
    // 마운트 직후 다음 틱에 open 처리해야 슬라이드 인 트랜지션이 걸림
    setTimeout(() => setDrawerOpen(true), 20);
  };

  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    closeDrawer();
  }, [pathname]);

  // 닫기 애니메이션이 끝난 뒤 DOM에서 제거
  useEffect(() => {
    if (drawerOpen || !drawerMounted) return;
    const timer = setTimeout(() => setDrawerMounted(false), 350);
    return () => clearTimeout(timer);
  }, [drawerOpen, drawerMounted]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo}>
          <img src="/img/logo.png" alt="마마치킨" />
        </Link>

        <nav className={styles.nav}>
          <ul>
            {NAV.map((item) => (
              <li key={item.href} className={isActive(item.href) ? styles.active : ''}>
                <Link href={item.href}>{item.label}</Link>
                <div className={styles.dropdown}>
                  {item.sub.map((s) => (
                    <Link key={s.label} href={s.href}>
                      {s.label}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </nav>

        {/* 모바일에서는 숨기고 햄버거 메뉴만 노출 (드로어 안에 전화주문 버튼 있음) */}
        <a href="tel:02-703-7979" className={styles.orderBtn}>
          📞 전화주문
        </a>

        <button type="button" aria-label="메뉴 열기" className={styles.moBtn} onClick={openDrawer}>
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* mobile drawer — 닫혀 있을 때는 렌더링하지 않음 */}
      {drawerMounted && (
        <>
          <div
            className={`${styles.drawerBackdrop} ${drawerOpen ? styles.open : ''}`}
            onClick={closeDrawer}
          />
          <aside className={`${styles.drawer} ${drawerOpen ? styles.open : ''}`}>
            <div className={styles.drawerTop}>
              <img src="/img/logo.png" alt="마마치킨" style={{ height: 34 }} />
              <button type="button" aria-label="닫기" onClick={closeDrawer}>
                ✕
              </button>
            </div>
            {NAV.map((item) => (
              <div key={item.href} className={styles.drawerGroup}>
                <Link href={item.href} className={styles.drawerTitle}>
                  {item.label}
                </Link>
                <div className={styles.drawerSub}>
                  {item.sub.map((s) => (
                    <Link key={s.label} href={s.href}>
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <a href="tel:02-703-7979" className={`btn btn-primary ${styles.drawerCall}`}>
              📞 02-703-7979
            </a>
          </aside>
        </>
      )}
    </header>
  );
}
