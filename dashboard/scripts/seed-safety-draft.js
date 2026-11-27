/* 매장별 안전재고 초안 입력
 *   npm run inv:safety            # 미리보기
 *   npm run inv:safety -- --apply # 입력
 *
 * 안전재고 = 최근 28일 하루 평균 사용량(레시피 기준) × 일수 (식자재 종류별)
 *   - 신선육(생닭·닭다리·윙봉·순살 정육): 1.5일치 — 자주 입고, 장기 보관 안 함
 *   - 음료·포장재·딥소스 컵: 5일치 — 발주 주기가 길고 보관이 쉬움
 *   - 그 외(소스·가루·시즈닝·냉동 사이드·떡·번·패티·채소·치킨무): 3일치 — 주 2~3회 발주 기준
 * 개·마리·병은 정수, g·ml는 100 단위로 올림. 운영 매장만, 사용량이 0인 식자재와 이미 안전재고가 있는 칸은 건너뜀.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const AVG_DAYS = 28;
const FRESH = ['생닭(1.2kg·10조각)', '닭다리(북채)', '윙봉', '순살 정육(닭다리살)'];
const LONG = /콜라|스프라이트|치킨박스|포장지|딥소스/;
const daysFor = (name) => (FRESH.includes(name) ? 1.5 : LONG.test(name) ? 5 : 3);
const roundUp = (v, unit) => (['g', 'ml'].includes(unit) ? Math.ceil(v / 100) * 100 : Math.ceil(v));

(async () => {
  const apply = process.argv.includes('--apply');
  const client = new Client({ connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const rows = (await client.query(
      `SELECT i.store_name, g.id, g.name, g.unit, sum(i.qty * r.qty) / $1::int AS avg_daily,
              EXISTS (SELECT 1 FROM inv_safety s WHERE s.store_name = i.store_name AND s.ingredient_id = g.id) AS has
       FROM v_pos_sales_item i
       JOIN inv_recipe r ON r.category = i.category AND r.std_name = i.std_name
       JOIN inv_ingredient g ON g.id = r.ingredient_id AND g.active
       WHERE i.sale_date > current_date - 1 - $1::int AND i.sale_date <= current_date - 1
         AND i.store_name IN (SELECT store_name FROM store_info GROUP BY 1 HAVING bool_or(status = '운영'))
       GROUP BY 1, 2, 3, 4 HAVING sum(i.qty * r.qty) > 0 ORDER BY 1, 3`,
      [AVG_DAYS],
    )).rows;
    const todo = rows.filter((r) => !r.has).map((r) => ({ ...r, days: daysFor(r.name), safety: roundUp(Number(r.avg_daily) * daysFor(r.name), r.unit) }));
    console.log(`대상 ${todo.length}칸 (이미 설정 ${rows.length - todo.length}칸 건너뜀)`);
    for (const r of todo) console.log(`  ${r.store_name} · ${r.name}: 일평균 ${Number(r.avg_daily).toFixed(1)}${r.unit} × ${r.days}일 → ${r.safety}${r.unit}`);
    if (!apply) {
      console.log('미리보기입니다. 입력하려면 --apply');
      return;
    }
    await client.query('BEGIN');
    for (const r of todo) {
      await client.query(
        `INSERT INTO inv_safety (store_name, ingredient_id, safety_qty) VALUES ($1, $2, $3) ON CONFLICT (store_name, ingredient_id) DO NOTHING`,
        [r.store_name, r.id, r.safety],
      );
    }
    await client.query(`INSERT INTO dash_audit (action, detail) VALUES ('safety_draft_seeded', $1)`, [JSON.stringify({ cells: todo.length, avgDays: AVG_DAYS })]);
    await client.query('COMMIT');
    console.log(`입력 완료: ${todo.length}칸`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('실패:', err.message);
  process.exitCode = 1;
});
