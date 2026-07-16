import type { Post } from '@/lib/types';

const LABEL: Record<string, string> = {
  ongoing: '진행중',
  ended: '종료',
  upcoming: '예정',
};

export function eventPeriodText(p: Post): string | null {
  if (!p.startDate && !p.endDate) return null;
  return `${p.startDate ?? ''} ~ ${p.endDate ?? ''}`;
}

/** 이벤트 진행 상태 배지 (진행중/종료/예정) */
export default function EventBadge({ status }: { status?: Post['status'] }) {
  if (!status) return null;
  return <span className={`event-badge event-badge--${status}`}>{LABEL[status]}</span>;
}
