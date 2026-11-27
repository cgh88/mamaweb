'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';

const NAV = [
  ['분석', [['/', '매출 현황'], ['/channel', '채널 분석'], ['/time', '시간 분석'], ['/menu', '메뉴 분석'], ['/stores', '매장 비교'], ['/orders', '주문 리포트']]],
  ['재고', [['/consumption', '식자재 소모량'], ['/inventory', '재고·안전재고']]],
  ['데이터 관리', [['/mapping', '메뉴 매핑 관리'], ['/recipes', '레시피·식자재']]],
];

export default function Sidebar({ username, status, alerts = { low: 0, warn: 0 } }) {
  const path = usePathname();
  return (
    <aside className="side">
      <div className="brand"><b>MAMA CHICKEN</b><span>매출 관리 · admin</span></div>
      <nav className="nav" aria-label="대시보드 메뉴">
        {NAV.map(([group, items]) => (
          <div key={group} style={{ display: 'contents' }}>
            <p>{group}</p>
            {items.map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? 'on' : ''}>
                <i />{label}
                {href === '/inventory' && alerts.low + alerts.warn > 0 && (
                  <span className="badge" title={`부족 ${alerts.low} · 주의 ${alerts.warn}`} aria-label={`재고 알람 ${alerts.low + alerts.warn}건`}>{alerts.low + alerts.warn}</span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sync">
        <b className={status.ok ? '' : 'bad'}>{status.ok ? '데이터 수집 정상' : '데이터 수집 확인 필요'}</b>
        <span>최근 데이터 {status.lastDay}</span>
        <span>마지막 수집 {status.fetched}</span>
      </div>
      <div className="userbox">
        <span>{username}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <Link href="/account">비밀번호</Link>
          <form action={logout}><button type="submit">로그아웃</button></form>
        </span>
      </div>
    </aside>
  );
}
