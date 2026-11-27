'use server';

import { revalidatePath } from 'next/cache';
import { q, q1, tx } from '@/lib/db';
import { audit, requireUser } from '@/lib/auth';
import { todayKst } from '@/lib/period';

/* 식자재·레시피·재고 입력. 모든 변경은 dash_audit에 기록 */

const num = (v) => {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const text = (v, max) => String(v ?? '').trim().slice(0, max);

async function checkStore(name) {
  return !!(await q1(`SELECT 1 FROM store_info WHERE store_name = $1 AND status = '운영'`, [name]));
}

/** 식자재 추가·수정 */
export async function saveIngredient(_prev, fd) {
  const user = await requireUser();
  const id = Number(fd.get('id')) || null;
  const name = text(fd.get('name'), 40);
  const unit = text(fd.get('unit'), 10);
  const packName = text(fd.get('pack_name'), 10) || null;
  const packSize = num(fd.get('pack_size'));
  const active = fd.get('active') !== '0';
  if (!name) return { error: '식자재 이름을 입력하세요.' };
  if (!unit) return { error: '단위를 입력하세요 (예: g, ml, 개, 마리).' };
  if (Number.isNaN(packSize) || (packSize !== null && packSize <= 0)) return { error: '발주 단위 수량은 0보다 큰 숫자로 입력하세요.' };
  try {
    if (id) {
      await q(`UPDATE inv_ingredient SET name = $2, unit = $3, pack_name = $4, pack_size = $5, active = $6, updated_at = now() WHERE id = $1`,
        [id, name, unit, packName, packSize, active]);
    } else {
      await q(`INSERT INTO inv_ingredient (name, unit, pack_name, pack_size, active) VALUES ($1, $2, $3, $4, $5)`, [name, unit, packName, packSize, active]);
    }
  } catch (err) {
    if (err.code === '23505') return { error: `'${name}' 식자재가 이미 있습니다.` };
    throw err;
  }
  await audit(user.id, id ? 'ingredient_updated' : 'ingredient_added', { id, name, unit, packName, packSize, active });
  revalidatePath('/', 'layout');
  return { ok: `${name} 저장했습니다.` };
}

/** 메뉴 레시피 저장 (해당 메뉴의 줄 전체 교체) */
export async function saveRecipe(_prev, fd) {
  const user = await requireUser();
  const category = text(fd.get('category'), 40);
  const stdName = text(fd.get('std_name'), 120);
  if (!category || !stdName) return { error: '메뉴를 선택하세요.' };
  const ids = fd.getAll('ingredient_id').map(Number);
  const qtys = fd.getAll('qty').map(num);
  const lines = new Map();
  for (let i = 0; i < ids.length; i += 1) {
    if (!ids[i] && qtys[i] === null) continue;
    if (!ids[i]) return { error: `${i + 1}번째 줄의 식자재를 고르세요.` };
    if (qtys[i] === null || Number.isNaN(qtys[i]) || qtys[i] <= 0) return { error: `${i + 1}번째 줄의 수량을 0보다 큰 숫자로 입력하세요.` };
    lines.set(ids[i], (lines.get(ids[i]) || 0) + qtys[i]);
  }
  await tx(async (tq) => {
    await tq('DELETE FROM inv_recipe WHERE category = $1 AND std_name = $2', [category, stdName]);
    for (const [ingredientId, qty] of lines) {
      await tq('INSERT INTO inv_recipe (category, std_name, ingredient_id, qty) VALUES ($1, $2, $3, $4)', [category, stdName, ingredientId, qty]);
    }
  });
  await audit(user.id, 'recipe_saved', { category, stdName, lines: [...lines] });
  revalidatePath('/', 'layout');
  return { ok: lines.size ? `레시피 ${lines.size}줄 저장했습니다. 모든 기간의 소모량에 바로 반영됩니다.` : '레시피를 비웠습니다.' };
}

/** 재고 실사 입력 (입력한 식자재만 저장) */
export async function saveCounts(_prev, fd) {
  const user = await requireUser();
  const store = text(fd.get('store'), 30);
  const date = text(fd.get('count_date'), 10);
  if (!(await checkStore(store))) return { error: '매장을 확인하세요.' };
  if (!isDate(date) || date > todayKst()) return { error: '실사 기준일을 확인하세요 (오늘 이후 불가).' };
  const rows = [];
  for (const [k, v] of fd.entries()) {
    if (!/^cnt_\d+$/.test(k)) continue;
    const n = num(v);
    if (n === null) continue;
    if (Number.isNaN(n) || n < 0) return { error: '실사 수량은 0 이상의 숫자로 입력하세요.' };
    rows.push([Number(k.slice(4)), n]);
  }
  if (!rows.length) return { error: '입력한 수량이 없습니다.' };
  await tx(async (tq) => {
    for (const [id, n] of rows) {
      await tq('INSERT INTO inv_stock_count (store_name, ingredient_id, count_date, qty, created_by) VALUES ($1, $2, $3, $4, $5)', [store, id, date, n, user.id]);
    }
  });
  await audit(user.id, 'stock_counted', { store, date, rows });
  revalidatePath('/', 'layout');
  return { ok: `${store} ${date} 실사 ${rows.length}건 저장했습니다.` };
}

/** 입고 등록 */
export async function addReceipt(_prev, fd) {
  const user = await requireUser();
  const store = text(fd.get('store'), 30);
  const date = text(fd.get('receipt_date'), 10);
  const id = Number(fd.get('ingredient_id'));
  const qty = num(fd.get('qty'));
  const note = text(fd.get('note'), 100) || null;
  if (!(await checkStore(store))) return { error: '매장을 확인하세요.' };
  if (!isDate(date) || date > todayKst()) return { error: '입고일을 확인하세요 (오늘 이후 불가).' };
  if (!id) return { error: '식자재를 고르세요.' };
  if (qty === null || Number.isNaN(qty) || qty <= 0) return { error: '입고 수량을 0보다 큰 숫자로 입력하세요.' };
  await q('INSERT INTO inv_receipt (store_name, ingredient_id, receipt_date, qty, note, created_by) VALUES ($1, $2, $3, $4, $5, $6)', [store, id, date, qty, note, user.id]);
  await audit(user.id, 'stock_received', { store, date, id, qty, note });
  revalidatePath('/', 'layout');
  return { ok: '입고를 등록했습니다.' };
}

/** 안전재고 저장 (빈칸은 설정 해제) */
export async function saveSafety(_prev, fd) {
  const user = await requireUser();
  const store = text(fd.get('store'), 30);
  if (!(await checkStore(store))) return { error: '매장을 확인하세요.' };
  const sets = [];
  const clears = [];
  for (const [k, v] of fd.entries()) {
    if (!/^safety_\d+$/.test(k)) continue;
    const id = Number(k.slice(7));
    const n = num(v);
    if (n === null) clears.push(id);
    else if (Number.isNaN(n) || n < 0) return { error: '안전재고는 0 이상의 숫자로 입력하세요.' };
    else sets.push([id, n]);
  }
  await tx(async (tq) => {
    for (const [id, n] of sets) {
      await tq(`INSERT INTO inv_safety (store_name, ingredient_id, safety_qty) VALUES ($1, $2, $3)
                ON CONFLICT (store_name, ingredient_id) DO UPDATE SET safety_qty = EXCLUDED.safety_qty, updated_at = now()`, [store, id, n]);
    }
    if (clears.length) await tq('DELETE FROM inv_safety WHERE store_name = $1 AND ingredient_id = ANY($2)', [store, clears]);
  });
  await audit(user.id, 'safety_saved', { store, sets, clears });
  revalidatePath('/', 'layout');
  return { ok: `${store} 안전재고 ${sets.length}건 저장했습니다.` };
}

/** 잘못 입력한 실사·입고 삭제 */
export async function deleteStockEntry(_prev, fd) {
  const user = await requireUser();
  const kind = fd.get('kind') === 'receipt' ? 'receipt' : 'count';
  const id = Number(fd.get('id'));
  const table = kind === 'receipt' ? 'inv_receipt' : 'inv_stock_count';
  const row = await q1(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);
  if (!row) return { error: '이미 삭제된 항목입니다.' };
  await audit(user.id, `stock_${kind}_deleted`, row);
  revalidatePath('/', 'layout');
  return { ok: '삭제했습니다.' };
}
