import 'server-only';
import { q, q1 } from './db';
import { addDays, todayKst } from './period';
import { AVG_DAYS, evaluate } from './stock';

/*
 * 식자재 소모량·재고
 *  - 소모량 = 주문상세(v_pos_sales_item) 수량 × 레시피(inv_recipe) — 옵션 행 포함, 취소는 음수 수량으로 상쇄
 *  - 레시피 키 = (분류, 표준 메뉴명). 같은 이름이라도 분류가 다르면 따로 (예: 베이스 소스 '마마양념' / 소스 선택 옵션 '마마양념')
 *  - 데이터는 매일 06:00에 어제까지 수집 → 재고 추정은 '어제 마감' 기준
 */

// 레시피 대상이 아닌 분류 (금액 행)
const NON_FOOD = `('배달비', '할인·조정', '요청사항')`;

export async function openStores() {
  return (await q(`SELECT store_name FROM store_info GROUP BY 1 HAVING bool_or(status = '운영') ORDER BY 1`)).map((r) => r.store_name);
}

/** store: '' = 운영 매장 전체, 그 외 매장명 */
function storeCond(store, params, alias = 'i') {
  if (store) {
    params.push(store);
    return `${alias}.store_name = $${params.length}`;
  }
  return `${alias}.store_name IN (SELECT store_name FROM store_info GROUP BY 1 HAVING bool_or(status = '운영'))`;
}

export async function ingredients({ activeOnly = false } = {}) {
  return q(`SELECT id, name, unit, pack_name, pack_size, active, note,
                   (SELECT count(*) FROM inv_recipe r WHERE r.ingredient_id = g.id) AS recipes
            FROM inv_ingredient g ${activeOnly ? 'WHERE active' : ''} ORDER BY active DESC, name`);
}

// ---------------------------------------------------------------- 레시피
/** 레시피 대상 메뉴: 최근 90일 판매된 표준 메뉴 + 레시피가 있는 메뉴 */
export async function recipeMenus() {
  return q(
    `WITH sold AS (
       SELECT category, std_name, sum(qty) AS qty FROM v_pos_sales_item
       WHERE sale_date > current_date - 90 AND category NOT IN ${NON_FOOD} AND category NOT LIKE '미분류%'
       GROUP BY 1, 2 HAVING sum(qty) > 0),
     rec AS (SELECT category, std_name, count(*) AS lines FROM inv_recipe GROUP BY 1, 2)
     SELECT COALESCE(s.category, r.category) AS category, COALESCE(s.std_name, r.std_name) AS std_name,
            COALESCE(s.qty, 0) AS qty, COALESCE(r.lines, 0) AS lines
     FROM sold s FULL JOIN rec r ON r.category = s.category AND r.std_name = s.std_name
     ORDER BY COALESCE(s.qty, 0) DESC, 2`,
  );
}

export async function recipeLines(category, stdName) {
  return q(
    `SELECT r.ingredient_id, r.qty, g.name, g.unit FROM inv_recipe r JOIN inv_ingredient g ON g.id = r.ingredient_id
     WHERE r.category = $1 AND r.std_name = $2 ORDER BY g.name`,
    [category, stdName],
  );
}

// ---------------------------------------------------------------- 소모량
export async function consumption(from, to, store) {
  const params = [from, to];
  const sc = storeCond(store, params);
  return q(
    `SELECT g.id, g.name, g.unit, g.pack_name, g.pack_size, sum(i.qty * r.qty) AS used
     FROM v_pos_sales_item i
     JOIN inv_recipe r ON r.category = i.category AND r.std_name = i.std_name
     JOIN inv_ingredient g ON g.id = r.ingredient_id
     WHERE i.sale_date BETWEEN $1 AND $2 AND ${sc}
     GROUP BY 1, 2, 3, 4, 5 ORDER BY 2`,
    params,
  );
}

/** 식자재별로 많이 쓴 메뉴 */
export async function consumptionByMenu(from, to, store) {
  const params = [from, to];
  const sc = storeCond(store, params);
  return q(
    `SELECT r.ingredient_id, i.std_name, sum(i.qty) AS menu_qty, sum(i.qty * r.qty) AS used
     FROM v_pos_sales_item i JOIN inv_recipe r ON r.category = i.category AND r.std_name = i.std_name
     WHERE i.sale_date BETWEEN $1 AND $2 AND ${sc}
     GROUP BY 1, 2 HAVING sum(i.qty * r.qty) > 0 ORDER BY 1, 4 DESC`,
    params,
  );
}

/** 일별 소모량 (선택 식자재) */
export async function consumptionDaily(from, to, store, ingredientId) {
  const params = [from, to, ingredientId];
  const sc = storeCond(store, params);
  return q(
    `SELECT i.sale_date AS d, sum(i.qty * r.qty) AS used
     FROM v_pos_sales_item i JOIN inv_recipe r ON r.category = i.category AND r.std_name = i.std_name
     WHERE i.sale_date BETWEEN $1 AND $2 AND r.ingredient_id = $3 AND ${sc}
     GROUP BY 1 ORDER BY 1`,
    params,
  );
}

/** 레시피 등록률: 판매 수량(옵션 제외) 중 레시피가 있는 메뉴 비율 + 미등록 상위 메뉴 */
export async function recipeCoverage(from, to, store) {
  const params = [from, to];
  const sc = storeCond(store, params);
  const rows = await q(
    `WITH s AS (
       SELECT i.category, i.std_name, sum(i.qty) AS qty, bool_or(i.is_option) AS is_option
       FROM v_pos_sales_item i
       WHERE i.sale_date BETWEEN $1 AND $2 AND ${sc} AND i.category NOT IN ${NON_FOOD}
       GROUP BY 1, 2 HAVING sum(i.qty) > 0)
     SELECT s.*, EXISTS (SELECT 1 FROM inv_recipe r WHERE r.category = s.category AND r.std_name = s.std_name) AS has_recipe
     FROM s ORDER BY qty DESC`,
    params,
  );
  const menus = rows.filter((r) => !r.is_option);
  const total = menus.reduce((a, r) => a + r.qty, 0);
  const covered = menus.filter((r) => r.has_recipe).reduce((a, r) => a + r.qty, 0);
  return { total, covered, missing: rows.filter((r) => !r.has_recipe).slice(0, 15) };
}

// ---------------------------------------------------------------- 재고
/** 매장의 식자재별 재고 상태 (어제 마감 기준) */
export async function stockStatus(store) {
  const yesterday = addDays(todayKst(), -1);
  const rows = await q(
    `WITH lc AS (
       SELECT DISTINCT ON (ingredient_id) ingredient_id, count_date, qty
       FROM inv_stock_count WHERE store_name = $1 ORDER BY ingredient_id, count_date DESC, id DESC),
     rc AS (
       SELECT r.ingredient_id, sum(r.qty) AS qty FROM inv_receipt r JOIN lc USING (ingredient_id)
       WHERE r.store_name = $1 AND r.receipt_date > lc.count_date GROUP BY 1),
     used AS (
       SELECT r.ingredient_id, i.sale_date, sum(i.qty * r.qty) AS used
       FROM v_pos_sales_item i JOIN inv_recipe r ON r.category = i.category AND r.std_name = i.std_name
       WHERE i.store_name = $1 AND i.sale_date <= $2
         AND i.sale_date > LEAST((SELECT min(count_date) FROM lc), $2::date - $3::int)
       GROUP BY 1, 2)
     SELECT g.id, g.name, g.unit, g.pack_name, g.pack_size,
            lc.count_date, lc.qty AS count_qty, COALESCE(rc.qty, 0) AS received,
            COALESCE((SELECT sum(u.used) FROM used u WHERE u.ingredient_id = g.id AND u.sale_date > lc.count_date), 0) AS used_since,
            COALESCE((SELECT sum(u.used) FROM used u WHERE u.ingredient_id = g.id AND u.sale_date > $2::date - $3::int), 0) / $3::int AS avg_daily,
            sf.safety_qty
     FROM inv_ingredient g
     LEFT JOIN lc ON lc.ingredient_id = g.id
     LEFT JOIN rc ON rc.ingredient_id = g.id
     LEFT JOIN inv_safety sf ON sf.store_name = $1 AND sf.ingredient_id = g.id
     WHERE g.active ORDER BY g.name`,
    [store, yesterday, AVG_DAYS],
  );
  return rows.map(evaluate);
}

/** 사이드바 알람: 운영 매장 전체의 부족·주의 건수 */
export async function stockAlerts() {
  const has = await q1('SELECT EXISTS (SELECT 1 FROM inv_safety) AS any');
  if (!has?.any) return { low: 0, warn: 0 };
  const stores = await openStores();
  const all = (await Promise.all(stores.map((s) => stockStatus(s)))).flat();
  return { low: all.filter((r) => r.status === 'low').length, warn: all.filter((r) => r.status === 'warn').length };
}

/** 최근 입력 이력 (실사·입고) */
export async function stockHistory(store) {
  return q(
    `SELECT * FROM (
       SELECT 'count' AS kind, c.id, c.count_date AS d, c.qty, NULL AS note, c.created_at, g.name, g.unit, u.username
       FROM inv_stock_count c JOIN inv_ingredient g ON g.id = c.ingredient_id LEFT JOIN dash_users u ON u.id = c.created_by
       WHERE c.store_name = $1
       UNION ALL
       SELECT 'receipt', r.id, r.receipt_date, r.qty, r.note, r.created_at, g.name, g.unit, u.username
       FROM inv_receipt r JOIN inv_ingredient g ON g.id = r.ingredient_id LEFT JOIN dash_users u ON u.id = r.created_by
       WHERE r.store_name = $1
     ) x ORDER BY created_at DESC LIMIT 30`,
    [store],
  );
}
