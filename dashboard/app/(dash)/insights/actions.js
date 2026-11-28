'use server';

import { revalidatePath } from 'next/cache';
import { q, q1 } from '@/lib/db';
import { audit, requireUser } from '@/lib/auth';
import { EVENT_CATEGORIES } from '@/lib/external';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const text = (v, max) => String(v ?? '').trim().slice(0, max);

/** 매장 이벤트 추가 (학사일정·경기·프로모션 등) */
export async function addEvent(_prev, fd) {
  const user = await requireUser();
  const from = text(fd.get('date_from'), 10);
  const to = text(fd.get('date_to'), 10) || from;
  const category = text(fd.get('category'), 20);
  const title = text(fd.get('title'), 80);
  const note = text(fd.get('note'), 200) || null;
  const store = text(fd.get('store'), 40) || null;
  if (!isDate(from) || !isDate(to)) return { error: '날짜를 확인하세요.' };
  if (to < from) return { error: '종료일이 시작일보다 빠릅니다.' };
  if (!EVENT_CATEGORIES.includes(category)) return { error: '분류를 선택하세요.' };
  if (!title) return { error: '이벤트 이름을 입력하세요.' };
  if (store && !(await q1('SELECT 1 FROM store_info WHERE store_name = $1', [store]))) return { error: '매장을 확인하세요.' };
  const row = await q1(
    'INSERT INTO ext_event (date_from, date_to, store_name, category, title, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [from, to, store, category, title, note],
  );
  await audit(user.id, 'event_added', { id: row.id, from, to, store, category, title });
  revalidatePath('/', 'layout');
  return { ok: `'${title}' 등록했습니다.`, at: Date.now() };
}

export async function deleteEvent(_prev, fd) {
  const user = await requireUser();
  const id = Number(fd.get('id'));
  const rows = await q('DELETE FROM ext_event WHERE id = $1 RETURNING *', [id]);
  if (!rows.length) return { error: '이미 삭제된 이벤트입니다.' };
  await audit(user.id, 'event_deleted', rows[0]);
  revalidatePath('/', 'layout');
  return { ok: '삭제했습니다.' };
}
