import 'server-only';
import { q } from './db';
import { addDays, todayKst } from './period';

/*
 * 외부 인사이트 (공휴일·날씨·예보·경쟁 브랜드 소식·매장 이벤트)
 *   수집: pos-sync/external.py (매일 06:00 POS 수집 뒤). 테이블이 아직 없거나 키가 없으면 빈 값으로 동작
 */
const safe = (p) => p.catch((err) => {
  if (err.code === '42P01') return []; // 테이블 없음 (수집 전)
  throw err;
});

export const EVENT_CATEGORIES = ['학사일정', '스포츠 경기', '우리 프로모션', '배달앱 행사', '지역 행사', '기타'];
export const KIND_ORDER = ['이벤트·할인', '신메뉴', '소식'];
export const BRAND_NAMES = ['bhc', 'BBQ', '교촌치킨', '굽네치킨', '60계치킨'];

// 매장 필터: '' = 운영 매장 전체, 'all' = 전체, 그 외 매장명
//   같은 store 값을 여러 번 써도 파라미터는 한 번만 추가
function storeCond(store, params, col = 'store_name') {
  if (store === 'all') return 'TRUE';
  if (store) {
    let i = params.indexOf(store, 2) + 1;
    if (!i) { params.push(store); i = params.length; }
    return `${col} = $${i}`;
  }
  return `${col} IN (SELECT store_name FROM store_info GROUP BY 1 HAVING bool_or(status = '운영'))`;
}

/** 기간 안의 공휴일 */
export async function holidays(from, to) {
  return safe(q('SELECT day, name FROM ext_holiday WHERE day BETWEEN $1 AND $2 ORDER BY day', [from, to]));
}

/** 기간과 겹치는 매장 이벤트 (store: 해당 매장 + 전 매장 이벤트) */
export async function events(from, to, store = '') {
  const params = [from, to];
  let w = '';
  if (store && store !== 'all') { params.push(store); w = `AND (store_name IS NULL OR store_name = $${params.length})`; }
  return safe(q(
    `SELECT id, date_from, date_to, store_name, category, title, note FROM ext_event
     WHERE date_from <= $2 AND date_to >= $1 ${w} ORDER BY date_from, id`, params));
}

/** 관측 날씨 (서울) */
export async function weather(from, to) {
  return safe(q('SELECT day, avg_ta, min_ta, max_ta, rain_mm, snow_cm FROM ext_weather WHERE day BETWEEN $1 AND $2 ORDER BY day', [from, to]));
}

/** 단기예보 (오늘 이후) */
export async function forecast() {
  return safe(q(`SELECT day, region, min_ta, max_ta, pop, rain_mm, rain_hours, sky, pty, base_at FROM ext_forecast WHERE day >= $1 ORDER BY day, region`, [todayKst()]));
}

/**
 * 경쟁 브랜드 소식: 언론사별 중복 기사를 한 소식(story)으로 묶어 최신순
 *   kind = 묶음 안에서 가장 중요한 분류 (이벤트·할인 > 신메뉴 > 소식)
 */
export async function brandStories({ days = 30, brand = '', kind = '', limit = 60 } = {}) {
  const params = [days];
  const w = [];
  if (brand) { params.push(brand); w.push(`brand = $${params.length}`); }
  // kind: '' = 이벤트·할인 + 신메뉴 (기본), 'all' = 일반 소식 포함 전체, 그 외 해당 분류만
  let having = `HAVING ${KIND_SQL} <> '소식'`;
  if (kind === 'all') having = '';
  else if (kind) { params.push(kind); having = `HAVING ${KIND_SQL} = $${params.length}`; }
  params.push(limit);
  return safe(q(
    `SELECT story, brand, ${KIND_SQL} AS kind,
            (array_agg(title ORDER BY (link = story) DESC, pub_at))[1] AS title,
            (array_agg(link ORDER BY (link = story) DESC, pub_at))[1] AS link,
            (array_agg(source ORDER BY (link = story) DESC, pub_at))[1] AS source,
            min(pub_at) AS first_at, max(pub_at) AS last_at, count(*)::int AS articles
     FROM ext_brand_news
     WHERE pub_at >= now() - make_interval(days => $1) ${w.length ? `AND ${w.join(' AND ')}` : ''}
     GROUP BY story, brand ${having}
     ORDER BY max(pub_at) DESC LIMIT $${params.length}`, params));
}
const KIND_SQL = `(CASE WHEN bool_or(kind = '이벤트·할인') THEN '이벤트·할인' WHEN bool_or(kind = '신메뉴') THEN '신메뉴' ELSE '소식' END)`;

/** 브랜드별 최근 N일 소식 수 (분류별) */
export async function brandSummary(days = 30) {
  return safe(q(
    `WITH s AS (SELECT story, brand, ${KIND_SQL} AS kind, max(pub_at) AS last_at, count(*) AS articles
                FROM ext_brand_news WHERE pub_at >= now() - make_interval(days => $1) GROUP BY story, brand)
     SELECT brand, kind, count(*)::int AS stories, sum(articles)::int AS articles, max(last_at) AS last_at FROM s GROUP BY 1, 2`, [days]));
}

/** 최근 3일 새 경쟁사 이벤트·신메뉴 소식 수 (사이드바 배지) */
export async function newBrandEventCount() {
  const rows = await safe(q(
    `SELECT count(*)::int AS n FROM (SELECT story FROM ext_brand_news GROUP BY story
       HAVING min(pub_at) >= now() - interval '3 days' AND bool_or(kind IN ('이벤트·할인', '신메뉴'))) s`));
  return rows[0]?.n || 0;
}

/** 수집 상태 */
export async function externalStatus() {
  const rows = await safe(q(
    `SELECT (SELECT max(day) FROM ext_weather) AS weather_last, (SELECT max(base_at) FROM ext_forecast) AS forecast_at,
            (SELECT max(fetched_at) FROM ext_brand_news) AS news_at, (SELECT min(provider) FROM ext_brand_news) AS news_provider,
            (SELECT count(*) FROM ext_holiday) AS holidays`));
  return rows[0] || {};
}

/**
 * 날씨와 매출: 최근 1년 일별 주문 수(매장 필터) × 서울 관측 날씨
 *   비 오는 날 = 강수 1mm 이상. 평일/주말(금·토·일) 따로 비교 — 요일 효과를 섞지 않도록
 */
export async function weatherImpact(to, store) {
  const params = [addDays(to, -364), to];
  const sw = (a) => storeCond(store, params, `${a}.store_name`);
  return safe(q(
    `WITH d AS (
       SELECT o.sale_date, count(*) FILTER (WHERE NOT o.is_cancel) AS orders,
              count(*) FILTER (WHERE NOT o.is_cancel AND o.sale_type_name = '배달') AS delivery,
              sum(o.sub_tot) AS net
       FROM v_pos_order o WHERE o.sale_date BETWEEN $1 AND $2 AND ${sw('o')}
       GROUP BY 1)
     SELECT CASE WHEN extract(isodow FROM d.sale_date) IN (5, 6, 7) THEN '주말(금·토·일)' ELSE '평일(월~목)' END AS daytype,
            CASE WHEN w.rain_mm >= 1 OR w.snow_cm > 0 THEN 'rain' ELSE 'dry' END AS wx,
            CASE WHEN w.avg_ta < 0 THEN '영하' WHEN w.avg_ta < 10 THEN '0~10℃' WHEN w.avg_ta < 20 THEN '10~20℃'
                 WHEN w.avg_ta < 27 THEN '20~27℃' ELSE '27℃ 이상' END AS temp,
            count(*)::int AS days, avg(d.orders) AS orders, avg(d.delivery) AS delivery, avg(d.net) AS net
     FROM d JOIN ext_weather w ON w.day = d.sale_date AND w.stn = 108
     WHERE d.sale_date NOT IN (SELECT day FROM ext_holiday)
     GROUP BY GROUPING SETS ((1, 2), (3))`, params));
}

/** 공휴일 매출 vs 같은 요일 평소 (최근 1년) */
export async function holidayImpact(to, store) {
  const params = [addDays(to, -364), to];
  const sw = (a) => storeCond(store, params, `${a}.store_name`);
  return safe(q(
    `WITH d AS (
       SELECT o.sale_date, extract(isodow FROM o.sale_date)::int AS dow, count(*) FILTER (WHERE NOT o.is_cancel) AS orders, sum(o.sub_tot) AS net
       FROM v_pos_order o WHERE o.sale_date BETWEEN $1 AND $2 AND ${sw('o')} GROUP BY 1),
     base AS (SELECT dow, avg(orders) AS orders FROM d WHERE sale_date NOT IN (SELECT day FROM ext_holiday) GROUP BY 1)
     SELECT h.day, h.name, d.orders, b.orders AS base_orders, d.net
     FROM ext_holiday h JOIN d ON d.sale_date = h.day JOIN base b ON b.dow = d.dow ORDER BY h.day DESC`, params));
}

/**
 * 앞으로 7일 예상 주문: 같은 요일 최근 4주 평균(공휴일 제외)
 *   × 공휴일 보정(최근 1년 공휴일/평소 비율) × 비 예보 보정(강수확률 60% 이상 또는 비·눈 예보 시, 최근 1년 비 오는 날/맑은 날 비율)
 *   생닭 예상 사용량 = 최근 28일 주문당 생닭 사용량(레시피 기준) × 예상 주문
 */
export async function baseForecast(store) {
  const today = todayKst();
  const params = [addDays(today, -28), addDays(today, -1)];
  const sw = (a) => storeCond(store, params, `${a}.store_name`);
  const [byDow, chicken] = await Promise.all([
    safe(q(
      `SELECT extract(isodow FROM o.sale_date)::int AS dow, count(*) FILTER (WHERE NOT o.is_cancel)::numeric / count(DISTINCT o.sale_date) AS orders,
              sum(o.sub_tot) / count(DISTINCT o.sale_date) AS net
       FROM v_pos_order o WHERE o.sale_date BETWEEN $1 AND $2 AND ${sw('o')}
         AND o.sale_date NOT IN (SELECT day FROM ext_holiday)
       GROUP BY 1`, params)),
    safe(q(
      `WITH u AS (SELECT sum(i.qty * r.qty) AS used FROM v_pos_sales_item i
                  JOIN inv_recipe r ON r.category = i.category AND r.std_name = i.std_name
                  JOIN inv_ingredient g ON g.id = r.ingredient_id AND g.name LIKE '생닭%'
                  WHERE i.sale_date BETWEEN $1 AND $2 AND ${sw('i')}),
            o AS (SELECT count(*) FILTER (WHERE NOT is_cancel) AS orders FROM v_pos_order o
                  WHERE o.sale_date BETWEEN $1 AND $2 AND ${sw('o')})
       SELECT u.used, o.orders FROM u, o`, params)),
  ]);
  const c = chicken[0];
  return { byDow, chickenPerOrder: c && Number(c.orders) ? Number(c.used || 0) / Number(c.orders) : 0 };
}
