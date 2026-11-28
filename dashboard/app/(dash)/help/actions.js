'use server';

import { revalidatePath } from 'next/cache';
import { q, q1 } from '@/lib/db';
import { audit, requireSuper, requireUser } from '@/lib/auth';
import { FEEDBACK_CATEGORIES, FEEDBACK_PAGES, FEEDBACK_STATUSES } from '@/lib/feedback';

const text = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

/** 개선 요청 보내기 (모든 계정) */
export async function sendFeedback(_prev, fd) {
  const user = await requireUser();
  const category = text(fd.get('category'), 20);
  const page = text(fd.get('page'), 30) || null;
  const title = text(fd.get('title'), 100);
  const body = text(fd.get('body'), 3000);
  if (!FEEDBACK_CATEGORIES.includes(category)) return { error: '종류를 선택하세요.' };
  if (page && !FEEDBACK_PAGES.includes(page)) return { error: '관련 화면을 다시 선택하세요.' };
  if (title.length < 2) return { error: '제목을 입력하세요.' };
  if (body.length < 5) return { error: '내용을 조금 더 자세히 적어 주세요.' };
  // 같은 계정이 1분에 5건 넘게 보내지 못하게
  const recent = await q1(`SELECT count(*)::int AS n FROM dash_feedback WHERE user_id = $1 AND created_at > now() - interval '1 minute'`, [user.id]);
  if (recent.n >= 5) return { error: '잠시 후 다시 보내 주세요.' };
  const row = await q1('INSERT INTO dash_feedback (user_id, category, page, title, body) VALUES ($1, $2, $3, $4, $5) RETURNING id', [user.id, category, page, title, body]);
  await audit(user.id, 'feedback_sent', { id: row.id, category, title });
  revalidatePath('/', 'layout');
  return { ok: `보냈습니다 (요청 #${row.id}). 처리 상태는 아래 '내가 보낸 요청'에서 볼 수 있습니다.`, at: Date.now() };
}

/** 상태·답변 변경 (슈퍼관리자) */
export async function updateFeedback(_prev, fd) {
  const user = await requireSuper();
  const id = Number(fd.get('id'));
  const status = text(fd.get('status'), 10);
  const reply = text(fd.get('reply'), 2000) || null;
  if (!FEEDBACK_STATUSES.includes(status)) return { error: '상태를 선택하세요.' };
  const rows = await q(
    `UPDATE dash_feedback SET status = $2, reply = $3, replied_by = CASE WHEN $3::text IS DISTINCT FROM reply THEN $4 ELSE replied_by END, updated_at = now()
     WHERE id = $1 RETURNING id`, [id, status, reply, user.id]);
  if (!rows.length) return { error: '요청을 찾을 수 없습니다.' };
  await audit(user.id, 'feedback_updated', { id, status, replied: !!reply });
  revalidatePath('/', 'layout');
  return { ok: '저장했습니다.', at: Date.now() };
}
