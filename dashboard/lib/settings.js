import 'server-only';
import { q } from './db';
import { decrypt, hasMasterKey } from './secret';
import { SETTING_DEFS } from './settings-def';

/** 설정 목록: 값 자체 대신 상태만 (비밀값은 끝 4자리 힌트) */
export async function settingRows() {
  const rows = await q(
    `SELECT s.key, s.value, s.secret, s.hint, s.updated_at, u.username AS updated_by
     FROM dash_setting s LEFT JOIN dash_users u ON u.id = s.updated_by`,
  ).catch((err) => (err.code === '42P01' ? [] : Promise.reject(err)));
  return Object.fromEntries(rows.map((r) => [r.key, {
    set: true, secret: r.secret, hint: r.hint, updated_at: r.updated_at, updated_by: r.updated_by,
    value: r.secret ? null : r.value, // 비밀값은 화면으로 보내지 않음
  }]));
}

/** 연결 테스트용 실제 값 (서버 안에서만 사용) */
export async function settingValue(key) {
  const rows = await q('SELECT value, secret FROM dash_setting WHERE key = $1', [key]);
  if (!rows.length) return null;
  return rows[0].secret ? decrypt(key, rows[0].value) : rows[0].value;
}

export { hasMasterKey, SETTING_DEFS };

/** 설정 변경 이력 */
export async function settingHistory(limit = 15) {
  return q(
    `SELECT a.at, a.action, a.detail, u.username FROM dash_audit a LEFT JOIN dash_users u ON u.id = a.user_id
     WHERE a.action LIKE 'setting_%' ORDER BY a.at DESC LIMIT $1`, [limit]);
}

/** 수집 상태 (운영 점검용) */
export async function opsStatus() {
  const one = async (sql) => (await q(sql).catch(() => [{}]))[0] || {};
  const [pos, ext, users] = await Promise.all([
    one(`SELECT max(sale_date) AS last_day, max(fetched_at) AS fetched_at, count(DISTINCT store_code) AS stores
         FROM pos_order_header WHERE sale_date >= current_date - 30`),
    one(`SELECT (SELECT max(day) FROM ext_weather) AS weather_last, (SELECT max(base_at) FROM ext_forecast) AS forecast_at,
                (SELECT max(fetched_at) FROM ext_brand_news) AS news_at, (SELECT min(provider) FROM ext_brand_news) AS news_provider,
                (SELECT max(day) FROM ext_holiday) AS holiday_last`),
    one(`SELECT count(*) AS n, max(last_login_at) AS last_login FROM dash_users`),
  ]);
  return { pos, ext, users };
}
