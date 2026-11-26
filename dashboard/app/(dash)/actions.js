'use server';

import { revalidatePath } from 'next/cache';
import { q, q1 } from '@/lib/db';
import { audit, requireUser } from '@/lib/auth';

const CATEGORIES = ['후라이드 치킨', '소스 치킨', '사이드', '버거', '딥 소스', '베이스 소스', '음료', '주류', '토핑', '치킨무', '세트·기타', '이벤트', '배달비', '할인·조정', '옵션', '옵션(소스선택)', '요청사항'];

/** 매장 정보 추가·수정 (store_info) */
export async function saveStore(_prev, formData) {
  const user = await requireUser();
  const code = String(formData.get('store_code') || '').trim();
  const name = String(formData.get('store_name') || '').trim();
  const status = formData.get('status') === '폐점' ? '폐점' : '운영';
  const note = String(formData.get('note') || '').trim() || null;
  if (!/^\d{4,12}$/.test(code)) return { error: 'POS 매장코드는 숫자 4~12자리입니다.' };
  if (!name || name.length > 30) return { error: '매장명을 입력하세요 (30자 이하).' };
  const before = await q1('SELECT store_name, status, note FROM store_info WHERE store_code = $1', [code]);
  await q(
    `INSERT INTO store_info (store_code, store_name, status, note) VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_code) DO UPDATE SET store_name = EXCLUDED.store_name, status = EXCLUDED.status,
       note = EXCLUDED.note, updated_at = now()`,
    [code, name, status, note],
  );
  await audit(user.id, before ? 'store_updated' : 'store_added', { code, before, after: { name, status, note } });
  revalidatePath('/', 'layout');
  return { ok: `${code} → ${name} 저장했습니다.` };
}

/** 메뉴 매핑 수정 (pos_menu_map) — 수동(manual)으로 저장되어 자동 매핑이 덮어쓰지 않음 */
export async function saveMapping(_prev, formData) {
  const user = await requireUser();
  const key = [String(formData.get('src')), String(formData.get('menu_group') ?? ''), String(formData.get('item_text'))];
  const row = await q1('SELECT * FROM pos_menu_map WHERE src = $1 AND menu_group = $2 AND item_text = $3', key);
  if (!row) return { error: '매핑 행을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.' };

  if (formData.get('reset') === '1') {
    // 자동 분류로 되돌리기: auto로 표시해 두면 다음 수집(또는 menu_map.py --reclassify) 때 규칙으로 다시 분류
    await q(`UPDATE pos_menu_map SET source = 'auto', updated_at = now() WHERE src = $1 AND menu_group = $2 AND item_text = $3`, key);
    await audit(user.id, 'mapping_reset', { key });
    revalidatePath('/', 'layout');
    return { ok: '자동 분류로 되돌렸습니다. 다음 수집(매일 06:00) 때 규칙에 따라 다시 분류됩니다.' };
  }

  const menuItemId = formData.get('menu_item_id') ? Number(formData.get('menu_item_id')) : null;
  let stdName = String(formData.get('std_name') || '').trim();
  let category = String(formData.get('category') || '');
  const isOption = formData.get('is_option') === '1';
  const renameAll = formData.get('rename_all') === '1';
  if (menuItemId) {
    const web = await q1('SELECT name, category FROM web_menu_items WHERE id = $1', [menuItemId]);
    if (!web) return { error: '홈페이지 메뉴를 찾을 수 없습니다.' };
    stdName = stdName || web.name;
    if (!category) category = web.category;
  }
  if (!stdName || stdName.length > 80) return { error: '표준 메뉴명을 입력하세요 (80자 이하).' };
  if (!CATEGORIES.includes(category)) return { error: '분류를 선택하세요.' };

  const after = { menu_item_id: menuItemId, std_name: stdName, category, is_option: isOption };
  await q(
    `UPDATE pos_menu_map SET menu_item_id = $4, std_name = $5, category = $6, is_option = $7, source = 'manual', updated_at = now()
     WHERE src = $1 AND menu_group = $2 AND item_text = $3`,
    [...key, menuItemId, stdName, category, isOption],
  );
  let renamed = 0;
  if (renameAll && row.std_name !== stdName) {
    // 같은 표준명으로 묶여 있던 다른 원래 표기도 함께 변경 (메뉴 병합·이름 정리)
    const res = await q(
      `UPDATE pos_menu_map SET std_name = $2, menu_item_id = $3, category = $4, source = 'manual', updated_at = now()
       WHERE std_name = $1 AND NOT (src = $5 AND menu_group = $6 AND item_text = $7) RETURNING 1`,
      [row.std_name, stdName, menuItemId, category, ...key],
    );
    renamed = res.length;
  }
  await audit(user.id, 'mapping_updated', { key, before: { menu_item_id: row.menu_item_id, std_name: row.std_name, category: row.category, is_option: row.is_option }, after, renamed });
  revalidatePath('/', 'layout');
  return { ok: `저장했습니다${renamed ? ` (같은 표준명 ${renamed}건도 함께 변경)` : ''}. 모든 기간의 집계에 바로 반영됩니다.` };
}
