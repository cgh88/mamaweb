import 'server-only';
import pg from 'pg';

// DATE 컬럼을 'YYYY-MM-DD' 문자열 그대로 (시간대 변환 방지)
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// NUMERIC(금액·수량)은 JS 숫자로 — 이 데이터 범위(수십억 원 이하)에서는 정밀도 문제 없음
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

// 개발 모드 핫리로드 때 풀이 여러 개 생기지 않도록 전역에 보관
const globalPool = globalThis;
export const pool =
  globalPool.__dashPool ||
  (globalPool.__dashPool = new pg.Pool({ max: 10, connectionTimeoutMillis: 5000, query_timeout: 20000 }));

export async function q(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function q1(text, params) {
  return (await q(text, params))[0];
}

/** 트랜잭션: fn(query) 안의 쿼리를 한 번에 커밋, 오류 시 롤백 */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(async (text, params) => (await client.query(text, params)).rows);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
