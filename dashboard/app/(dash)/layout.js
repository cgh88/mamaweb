import Sidebar from '@/components/Sidebar';
import { requireUser } from '@/lib/auth';
import { dataStatus } from '@/lib/queries';
import { stockAlerts } from '@/lib/inventory';
import { newBrandEventCount } from '@/lib/external';
import { addDays, todayKst } from '@/lib/period';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }) {
  const user = await requireUser({ allowMustChange: true });
  const [s, alerts, newEvents] = await Promise.all([dataStatus(), stockAlerts().catch(() => ({ low: 0, warn: 0 })), newBrandEventCount().catch(() => 0)]);
  const fetched = s?.fetched_at
    ? new Date(s.fetched_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '-';
  // 매일 06:00 수집 → 어제 데이터가 있어야 정상 (오전 6시 이전에는 그저께까지)
  const ok = s?.last_day && s.last_day >= addDays(todayKst(), -2);
  return (
    <div className="app">
      <Sidebar username={user.username} status={{ ok, lastDay: s?.last_day || '-', fetched }} alerts={alerts} newEvents={newEvents} />
      <main className="main">{children}</main>
    </div>
  );
}
