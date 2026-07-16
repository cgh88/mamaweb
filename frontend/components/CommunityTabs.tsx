'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: '새소식', href: '/community' },
  { label: '이벤트', href: '/community/events' },
  { label: '고객의 소리', href: '/community/voice' },
  { label: '제휴문의', href: '/community/partnership' },
];

export default function CommunityTabs({ active }: { active?: string }) {
  const pathname = usePathname();
  const current = active ?? pathname;

  return (
    <div
      style={{
        padding: '28px 0',
        position: 'sticky',
        top: 'var(--header-h)',
        zIndex: 40,
        background: 'rgba(250, 246, 239, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="chip-tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`chip ${current === t.href ? 'active' : ''}`}>
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
