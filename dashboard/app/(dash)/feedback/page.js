import Link from 'next/link';
import { requireSuper } from '@/lib/auth';
import { FEEDBACK_STATUSES, allFeedback, feedbackCounts } from '@/lib/feedback';
import { withParams } from '@/lib/period';
import { FeedbackAdmin } from '../help/FeedbackForms';

export const metadata = { title: '개선 요청 관리 · 마마치킨' };

const fmt = (ts) => new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusTag = (s) => (s === '완료' ? 'tag on' : s === '보류' ? 'tag off' : s === '접수' ? 'tag warn' : 'tag web');

/** 슈퍼관리자 전용: 모든 개선 요청 보기·상태·답변 */
export default async function FeedbackPage({ searchParams }) {
  await requireSuper();
  const sp = await searchParams;
  const filter = sp.status === 'all' || FEEDBACK_STATUSES.includes(sp.status) ? sp.status : 'open';
  const [items, counts] = await Promise.all([allFeedback(filter === 'all' ? '' : filter), feedbackCounts()]);
  const open = FEEDBACK_STATUSES.filter((s) => !['완료', '보류'].includes(s)).reduce((n, s) => n + (counts[s] || 0), 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>개선 요청 관리</h1>
          <div className="muted">모든 계정이 보낸 요청 · 상태와 답변은 요청자의 도움말 화면에 보입니다</div>
        </div>
        <Link className="btn" href="/help">도움말 화면</Link>
      </div>

      <div className="tabs" role="group" aria-label="상태">
        {[['open', `처리할 요청 ${open}`], ...FEEDBACK_STATUSES.map((s) => [s, `${s} ${counts[s] || 0}`]), ['all', `전체 ${total}`]].map(([v, l]) => (
          <Link key={v} scroll={false} className={filter === v ? 'on' : ''} href={withParams(sp, { status: v === 'open' ? '' : v })}>{l}</Link>
        ))}
      </div>

      <section className="panel">
        {items.length === 0 ? <div className="empty">해당하는 요청이 없습니다.</div> : (
          <div className="fb-list">
            {items.map((f) => (
              <div key={f.id} className="fb-admin">
                <div className="fb-head">
                  <span className={statusTag(f.status)}>{f.status}</span>
                  <b>{f.title}</b>
                  <span className="small muted">#{f.id} · {f.username || '삭제된 계정'} · {fmt(f.created_at)}</span>
                </div>
                <div className="small muted">{f.category}{f.page ? ` · ${f.page}` : ''}{f.replied_name ? ` · 답변 ${f.replied_name} (${fmt(f.updated_at)})` : ''}</div>
                <p className="fb-body">{f.body}</p>
                <FeedbackAdmin item={{ id: f.id, status: f.status, reply: f.reply }} statuses={FEEDBACK_STATUSES} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
