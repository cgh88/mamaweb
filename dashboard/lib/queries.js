import 'server-only';
import { q, q1 } from './db';
import { addDays } from './period';
import { getAmount } from './amount-server';

/** 매출 금액 컬럼 (순매출 sub_tot 기본 / 실매출 grand_total / 총매출 gross_amt) — 화이트리스트 값만 SQL에 넣음 */
const revCol = async () => (await getAmount()).col;

/*
 * 집계 기준
 *  - 매출 금액: 주문 헤더(v_pos_order) 기준. 기본 순매출(sub_tot, 할인·부가세 제외), 화면에서 실매출·총매출 선택
 *    취소(sale_stat='B')는 음수로 들어와 합계에서 상쇄
 *  - 주문 수: 취소가 아닌 주문 건수
 *  - 메뉴: 주문상세(v_pos_sales_item) 수량, 옵션 행 제외 — 상세 금액은 할인 전 정가라 매출로 쓰지 않음
 *  - 매장: store_info의 매장명 단위 (같은 매장의 POS 코드 변경은 하나로 합쳐짐)
 */

// ---------------------------------------------------------------- 매장 필터
// store 파라미터: '' = 운영 매장 / 'all' = 폐점 포함 전체 / 그 외 = 매장명
export async function storeOptions() {
  return q(`SELECT store_name, bool_or(status = '운영') AS open FROM store_info GROUP BY 1 ORDER BY bool_or(status = '운영') DESC, 1`);
}

function storeWhere(store, params, alias = '') {
  const a = alias ? `${alias}.` : '';
  if (store === 'all') return 'TRUE';
  if (store) {
    params.push(store);
    return `${a}store_name = $${params.length}`;
  }
  return `${a}store_status = '운영'`;
}

/** 전년 비교용 동일 매장: 두 기간 모두 매출이 있는 매장명 */
async function sameStores(p, store) {
  const params = [p.from, p.to, p.cmpFrom, p.cmpTo];
  const sw = storeWhere(store, params);
  const rows = await q(
    `SELECT store_name FROM v_pos_order WHERE ${sw} AND sale_date BETWEEN $1 AND $2
     INTERSECT SELECT store_name FROM v_pos_order WHERE ${sw} AND sale_date BETWEEN $3 AND $4`,
    params,
  );
  return rows.map((r) => r.store_name);
}

async function kpiRange(from, to, store, onlyStores) {
  const c = await revCol();
  const params = [from, to];
  let where = `sale_date BETWEEN $1 AND $2 AND ${storeWhere(store, params)}`;
  if (onlyStores) {
    params.push(onlyStores);
    where += ` AND store_name = ANY($${params.length})`;
  }
  return q1(
    `SELECT COALESCE(sum(${c}), 0) AS rev,
            count(*) FILTER (WHERE NOT is_cancel) AS orders,
            count(*) FILTER (WHERE is_cancel) AS cancels,
            count(*) FILTER (WHERE is_cancel AND sale_type_name = '배달') AS delivery_cancels
     FROM v_pos_order WHERE ${where}`,
    params,
  );
}

// ---------------------------------------------------------------- 매출 현황
export async function overview(p, store) {
  const lfl = p.cmp === 'yoy' ? await sameStores(p, store) : null;
  const [cur, base] = await Promise.all([
    kpiRange(p.from, p.to, store, lfl),
    kpiRange(p.cmpFrom, p.cmpTo, store, lfl),
  ]);
  return { cur, base, lfl };
}

export async function daily(p, store) {
  const c = await revCol();
  const cp = [p.from, p.to];
  const pp = [p.cmpFrom, p.cmpTo];
  const [cur, prev] = await Promise.all([
    q(`SELECT sale_date AS d, sum(${c}) AS rev, count(*) FILTER (WHERE NOT is_cancel) AS orders
       FROM v_pos_order WHERE sale_date BETWEEN $1 AND $2 AND ${storeWhere(store, cp)} GROUP BY 1 ORDER BY 1`, cp),
    q(`SELECT sale_date AS d, sum(${c}) AS rev
       FROM v_pos_order WHERE sale_date BETWEEN $1 AND $2 AND ${storeWhere(store, pp)} GROUP BY 1 ORDER BY 1`, pp),
  ]);
  return { cur, prev };
}

export async function storeBreakdown(p, store) {
  const c = await revCol();
  const params = [p.from, p.to];
  return q(
    `SELECT store_name, bool_or(store_status = '운영') AS open,
            sum(${c}) AS rev,
            count(*) FILTER (WHERE NOT is_cancel) AS orders,
            sum(${c}) FILTER (WHERE sale_type_name = '배달') AS delivery,
            sum(${c}) FILTER (WHERE sale_type_name = '매장') AS dinein,
            sum(${c}) FILTER (WHERE sale_type_name = '포장') AS takeout,
            count(*) FILTER (WHERE NOT is_cancel AND sale_type_name = '배달') AS delivery_orders,
            count(*) FILTER (WHERE NOT is_cancel AND sale_type_name = '매장') AS dinein_orders
     FROM v_pos_order WHERE sale_date BETWEEN $1 AND $2 AND ${storeWhere(store, params)}
     GROUP BY 1 ORDER BY sum(${c}) DESC`,
    params,
  );
}

/** 최근 12개월 매장별 월 매출 (to가 속한 달까지) */
export async function monthlyByStore(to, store) {
  const c = await revCol();
  const params = [to];
  return q(
    `SELECT to_char(sale_date, 'YYYY-MM') AS m, store_name, sum(${c}) AS rev
     FROM v_pos_order
     WHERE sale_date >= (date_trunc('month', $1::date) - interval '11 months')::date AND sale_date <= $1
       AND ${store === '' ? 'TRUE' : storeWhere(store, params)}
     GROUP BY 1, 2 ORDER BY 1, 2`,
    params,
  );
}

// ---------------------------------------------------------------- 채널
export async function byType(from, to, store) {
  const c = await revCol();
  const params = [from, to];
  return q(
    `SELECT sale_type_name AS name, sum(${c}) AS rev,
            count(*) FILTER (WHERE NOT is_cancel) AS orders, count(*) FILTER (WHERE is_cancel) AS cancels
     FROM v_pos_order WHERE sale_date BETWEEN $1 AND $2 AND ${storeWhere(store, params)}
     GROUP BY 1 ORDER BY 2 DESC`,
    params,
  );
}

/** 주문 채널: v_pos_order.order_channel (주문상세에 배달앱 메뉴코드가 있으면 그 앱, 없으면 '매장' = 매장 POS 직접 주문) */
export async function byApp(from, to, store) {
  const c = await revCol();
  const params = [from, to];
  return q(
    `SELECT o.order_channel AS name, sum(o.${c}) AS rev,
            count(*) FILTER (WHERE NOT o.is_cancel) AS orders, count(*) FILTER (WHERE o.is_cancel) AS cancels
     FROM v_pos_order o
     WHERE o.sale_date BETWEEN $1 AND $2 AND ${storeWhere(store, params, 'o')}
     GROUP BY 1 ORDER BY 2 DESC`,
    params,
  );
}

export async function typeTrend(to, store) {
  const c = await revCol();
  const params = [to];
  return q(
    `SELECT to_char(sale_date, 'YYYY-MM') AS m, sale_type_name AS name, sum(${c}) AS rev
     FROM v_pos_order
     WHERE sale_date >= (date_trunc('month', $1::date) - interval '5 months')::date AND sale_date <= $1
       AND ${storeWhere(store, params)}
     GROUP BY 1, 2 ORDER BY 1`,
    params,
  );
}

// ---------------------------------------------------------------- 시간
export async function heatmap(p, store, saleType) {
  const c = await revCol();
  const params = [p.from, p.to];
  let where = `sale_date BETWEEN $1 AND $2 AND NOT is_cancel AND order_date IS NOT NULL AND ${storeWhere(store, params)}`;
  if (saleType) {
    params.push(saleType);
    where += ` AND sale_type_name = $${params.length}`;
  }
  return q(
    `SELECT extract(isodow FROM order_date)::int AS dow, extract(hour FROM order_date)::int AS hour,
            count(*) AS orders, sum(${c}) AS rev
     FROM v_pos_order WHERE ${where} GROUP BY 1, 2`,
    params,
  );
}

// ---------------------------------------------------------------- 메뉴
const CHICKEN = `category IN ('후라이드 치킨', '소스 치킨')`;
const MENU_TABS = {
  치킨: CHICKEN,
  사이드: `category = '사이드'`,
  버거: `category = '버거'`,
  소스: `category IN ('딥 소스', '베이스 소스')`,
  '음료·주류': `category IN ('음료', '주류')`,
  '세트·기타': `category IN ('세트·기타', '토핑', '치킨무', '이벤트')`,
};
export const MENU_TAB_NAMES = ['전체', ...Object.keys(MENU_TABS)];

function itemWhere(from, to, store, params) {
  params.push(from, to);
  const a = params.length;
  return `sale_date BETWEEN $${a - 1} AND $${a} AND NOT is_option AND ${storeItemWhere(store, params)}`;
}
// v_pos_sales_item에는 store_status가 없어 store_info로 판정
function storeItemWhere(store, params) {
  if (store === 'all') return 'TRUE';
  if (store) {
    params.push(store);
    return `store_name = $${params.length}`;
  }
  return `store_code IN (SELECT store_code FROM store_info WHERE status = '운영')`;
}

export async function menuRanking(p, store, tab) {
  const params = [];
  const curW = itemWhere(p.from, p.to, store, params);
  const prevW = itemWhere(p.cmpFrom, p.cmpTo, store, params);
  const tabW = MENU_TABS[tab] || `category NOT IN ('배달비', '할인·조정', '미분류')`;
  return q(
    `WITH c AS (SELECT std_name, min(category) AS category, bool_or(menu_item_id IS NOT NULL) AS web, sum(qty) AS qty
                FROM v_pos_sales_item WHERE ${curW} AND ${tabW} GROUP BY 1),
          b AS (SELECT std_name, sum(qty) AS qty FROM v_pos_sales_item WHERE ${prevW} AND ${tabW} GROUP BY 1)
     SELECT c.*, COALESCE(b.qty, 0) AS prev_qty FROM c LEFT JOIN b USING (std_name)
     WHERE c.qty > 0 ORDER BY c.qty DESC LIMIT 15`,
    params,
  );
}

export async function menuMix(p, store) {
  const params = [];
  const w = itemWhere(p.from, p.to, store, params);
  // 소스 선택: 0원 옵션 행(옵션이므로 is_option 조건 없이) + 메뉴명에 소스가 적힌 치킨
  const sp = [p.from, p.to];
  const sw = storeItemWhere(store, sp);
  const [cuts, flavors, sauces] = await Promise.all([
    q(`SELECT cut, sum(qty) AS qty FROM v_pos_sales_item WHERE ${w} AND ${CHICKEN} AND cut IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`, params),
    q(`SELECT CASE WHEN flavor = '후라이드' THEN '후라이드' WHEN flavor = '반반·소스선택' THEN '반반·소스선택' ELSE '단일 소스' END AS name,
              sum(qty) AS qty FROM v_pos_sales_item WHERE ${w} AND ${CHICKEN} GROUP BY 1 ORDER BY 2 DESC`, params),
    q(`SELECT v.flavor AS name, count(*) AS n, bool_or(m.id IS NOT NULL) AS web
       FROM v_pos_sales_item v LEFT JOIN web_menu_items m ON m.category = '베이스 소스' AND m.name = v.flavor
       WHERE v.sale_date BETWEEN $1 AND $2 AND ${sw}
         AND v.flavor IS NOT NULL AND v.flavor NOT IN ('후라이드', '반반·소스선택')
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, sp),
  ]);
  return { cuts, flavors, sauces };
}

export async function attachRates(p, store) {
  const params = [];
  const w = itemWhere(p.from, p.to, store, params);
  return q1(
    `WITH o AS (SELECT inv_seq, bool_or(${CHICKEN}) ch, bool_or(category = '버거') burger, bool_or(category = '사이드') side,
                       bool_or(category IN ('딥 소스', '베이스 소스')) dip, bool_or(category IN ('음료', '주류')) drink
                FROM v_pos_sales_item WHERE ${w} GROUP BY 1)
     SELECT count(*) FILTER (WHERE ch) AS chicken_orders,
            count(*) FILTER (WHERE ch AND burger) AS burger, count(*) FILTER (WHERE ch AND side) AS side,
            count(*) FILTER (WHERE ch AND dip) AS dip, count(*) FILTER (WHERE ch AND drink) AS drink
     FROM o`,
    params,
  );
}

export async function weeklyTop(to, store, limit = 3) {
  const from = addDays(to, -83);
  const params = [];
  const w = itemWhere(from, to, store, params);
  return q(
    `WITH top AS (SELECT std_name FROM v_pos_sales_item WHERE ${w} AND ${CHICKEN} GROUP BY 1 ORDER BY sum(qty) DESC LIMIT ${limit})
     SELECT std_name, date_trunc('week', sale_date)::date AS wk, sum(qty) AS qty
     FROM v_pos_sales_item WHERE ${w} AND std_name IN (SELECT std_name FROM top) GROUP BY 1, 2 ORDER BY 1, 2`,
    params,
  );
}

// ---------------------------------------------------------------- 매장
export async function storeProfiles() {
  const c = await revCol();
  return q(
    `SELECT i.store_name, bool_or(i.status = '운영') AS open,
            array_agg(DISTINCT i.store_code ORDER BY i.store_code) AS codes,
            min(o.sale_date) AS first_day, max(o.sale_date) AS last_day,
            count(DISTINCT o.sale_date) AS days, COALESCE(sum(o.${c}), 0) AS life
     FROM store_info i LEFT JOIN v_pos_order o ON o.store_code = i.store_code
     GROUP BY 1 ORDER BY bool_or(i.status = '운영') DESC, sum(o.${c}) DESC NULLS LAST`,
  );
}

export async function storeInfoRows() {
  return q(
    `SELECT i.store_code, i.store_name, i.status, i.note, min(h.sale_date) AS first_day, max(h.sale_date) AS last_day
     FROM store_info i LEFT JOIN pos_order_header h ON h.store_code = i.store_code
     GROUP BY 1, 2, 3, 4
     UNION ALL
     SELECT h.store_code, NULL, '미등록', NULL, min(h.sale_date), max(h.sale_date)
     FROM pos_order_header h WHERE h.store_code NOT IN (SELECT store_code FROM store_info) GROUP BY 1
     ORDER BY 3, 1`,
  );
}

// ---------------------------------------------------------------- 메뉴 매핑
export async function mappingStats() {
  return q1(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE menu_item_id IS NOT NULL AND NOT is_option) AS web,
            count(*) FILTER (WHERE menu_item_id IS NULL AND NOT is_option) AS std_only,
            count(*) FILTER (WHERE is_option) AS options,
            count(*) FILTER (WHERE source = 'manual') AS manual,
            count(*) FILTER (WHERE created_at > now() - interval '7 days') AS recent
     FROM pos_menu_map`,
  );
}

const MAP_FILTERS = {
  unlinked: `NOT m.is_option AND m.menu_item_id IS NULL`,
  recent: `m.created_at > now() - interval '7 days'`,
  manual: `m.source = 'manual'`,
  options: `m.is_option`,
  all: 'TRUE',
};
export const MAP_FILTER_NAMES = [
  ['unlinked', '홈페이지 미등록'], ['recent', '최근 7일 추가'], ['manual', '수동 수정'], ['options', '옵션·요청'], ['all', '전체'],
];

export async function mappingList({ filter = 'unlinked', search = '', page = 1 }) {
  const params = [];
  let where = MAP_FILTERS[filter] || MAP_FILTERS.unlinked;
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (m.item_text ILIKE $${params.length} OR m.std_name ILIKE $${params.length})`;
  }
  params.push((Math.max(1, page) - 1) * 50);
  return q(
    `WITH cnt AS (
       SELECT CASE WHEN id_code ~ '^[A-Z]' THEN 'APP' ELSE 'POS' END src,
              CASE WHEN id_code ~ '^[A-Z]' THEN '' ELSE COALESCE(id_menuname, '') END grp,
              btrim(id_desc) t, count(*) n, max(sale_date) last_day,
              string_agg(DISTINCT regexp_replace(id_code, '[0-9].*$', ''), ',') codes
       FROM pos_order_detail WHERE id_desc IS NOT NULL GROUP BY 1, 2, 3)
     SELECT m.src, m.menu_group, m.item_text, m.is_option, m.menu_item_id, m.std_name, m.category, m.cut, m.flavor,
            m.source, w.name AS web_name, COALESCE(c.n, 0) AS n, c.last_day, c.codes,
            count(*) OVER () AS total
     FROM pos_menu_map m
     LEFT JOIN cnt c ON c.src = m.src AND c.grp = m.menu_group AND c.t = m.item_text
     LEFT JOIN web_menu_items w ON w.id = m.menu_item_id
     WHERE ${where}
     ORDER BY COALESCE(c.n, 0) DESC, m.item_text
     LIMIT 50 OFFSET $${params.length}`,
    params,
  );
}

export async function webMenuItems() {
  return q(`SELECT id, category, sub_tab, name FROM web_menu_items WHERE category <> 'BEST MENU' ORDER BY id`);
}

export async function dataStatus() {
  return q1(`SELECT max(sale_date) AS last_day, max(fetched_at) AS fetched_at FROM pos_order_header`);
}

// ---------------------------------------------------------------- 판매유형 × 주문 채널
/**
 * 주문 채널(배민·쿠팡·요기요·매장 POS) × 판매유형(배달·포장·매장) — 배민·쿠팡 포장 주문은 POS 판매유형 '포장'
 * kind: 주문 구분 (배민 배달·배민 포장·쿠팡 배달·쿠팡 포장·전화 배달·방문 포장·홀)
 */
export async function typeByChannel(p, store) {
  const c = await revCol();
  const params = [p.from, p.to];
  return q(
    `SELECT o.sale_type_name AS type, o.order_kind AS kind, o.order_channel AS channel, sum(o.${c}) AS rev,
            count(*) FILTER (WHERE NOT o.is_cancel) AS orders, count(*) FILTER (WHERE o.is_cancel) AS cancels
     FROM v_pos_order o
     WHERE o.sale_date BETWEEN $1 AND $2 AND ${storeWhere(store, params, 'o')}
     GROUP BY 1, 2, 3`,
    params,
  );
}

// ---------------------------------------------------------------- 주문 리포트 (헤더 + 상세)
export const ORDER_PAGE_SIZE = 50;

function orderFilter(p, store, f) {
  const params = [p.from, p.to];
  const w = ['o.sale_date BETWEEN $1 AND $2', storeWhere(store, params, 'o')];
  if (f.type) { params.push(f.type); w.push(`o.sale_type_name = $${params.length}`); }
  if (f.status === 'cancel') w.push('o.is_cancel');
  else if (f.status === 'ok') w.push('NOT o.is_cancel');
  if (f.channel) { params.push(f.channel); w.push(`o.order_channel = $${params.length}`); }
  if (f.kind) { params.push(f.kind); w.push(`o.order_kind = $${params.length}`); }
  if (f.search) {
    params.push(`%${f.search.replace(/[\\%_]/g, '\\$&')}%`);
    w.push(`EXISTS (SELECT 1 FROM v_pos_sales_item i WHERE i.inv_seq = o.inv_seq
                    AND (i.item_text ILIKE $${params.length} OR i.std_name ILIKE $${params.length}))`);
  }
  return { params, where: w.join(' AND ') };
}

/** 조건에 맞는 주문 합계 (금액은 취소 차감) */
export async function orderSummary(p, store, f) {
  const { params, where } = orderFilter(p, store, f);
  return q1(
    `SELECT count(*) FILTER (WHERE NOT o.is_cancel) AS orders, count(*) FILTER (WHERE o.is_cancel) AS cancels,
            COALESCE(sum(o.gross_amt), 0) AS gross, COALESCE(sum(o.gross_amt - o.grand_total), 0) AS dc,
            COALESCE(sum(o.grand_total), 0) AS paid, COALESCE(sum(o.tax_tot), 0) AS tax, COALESCE(sum(o.sub_tot), 0) AS net
     FROM v_pos_order o WHERE ${where}`,
    params,
  );
}

/** 주문 헤더 목록 (최신순). limit=0이면 전체 (CSV 내려받기용) */
export async function orderList(p, store, f, page = 1, limit = ORDER_PAGE_SIZE) {
  const { params, where } = orderFilter(p, store, f);
  let tail = '';
  if (limit) {
    params.push(limit, (page - 1) * limit);
    tail = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }
  return q(
    `SELECT o.inv_seq, o.sale_date, to_char(o.order_date, 'YYYY-MM-DD HH24:MI') AS order_time, o.store_name, o.pos_no,
            o.sale_type_name, o.order_kind, o.order_channel AS channel, o.is_cancel, o.ret_inv_seq,
            o.gross_amt AS gross, o.gross_amt - o.grand_total AS dc, o.grand_total AS paid, o.tax_tot AS tax, o.sub_tot AS net,
            o.ax_card, o.ax_cash, o.ax_etc, o.dc_reason_desc, count(*) OVER () AS total
     FROM v_pos_order o
     WHERE ${where}
     ORDER BY o.order_date DESC NULLS LAST, o.inv_seq DESC ${tail}`,
    params,
  );
}

/** 주문 상세 행 */
export async function orderItems(invSeqs) {
  if (!invSeqs.length) return [];
  return q(
    `SELECT inv_seq, inv_nos, id_code, item_text, std_name, category, is_option, qty, qtyprice, sumprice, dc_reason_desc
     FROM v_pos_sales_item WHERE inv_seq = ANY($1) ORDER BY inv_seq, inv_nos`,
    [invSeqs],
  );
}
