/* 대시보드 테이블·권한 생성 — mamapos DB 소유자(mamapos) 접속 정보로 실행
 *   운영 서버:  set -a; . ../pos-sync/.env; set +a; npm run db:init
 * 반복 실행해도 안전합니다.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
    const { rows } = await client.query(
      "SELECT has_table_privilege('mamadash', 'pos_order_header', 'SELECT') AS can_read, has_table_privilege('mamadash', 'pos_order_header', 'UPDATE') AS can_write_sales",
    ).catch(() => ({ rows: [{}] }));
    console.log('대시보드 테이블 준비 완료', rows[0]);
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('실패:', err.message);
  process.exitCode = 1;
});
